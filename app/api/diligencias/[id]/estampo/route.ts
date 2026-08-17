import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { ApiError, apiFailure, parseApiInput } from '@/lib/api/server'
import { buildDocumentGenerationMetadata } from '@/lib/documents/generationMetadata'
import { hasStoredPdf, uploadPdfToDocumentStorage } from '@/lib/documents/storage'
import { prisma } from '@/lib/prisma'
import { EstampoGenerateSchema } from '@/lib/validations/rol-workspace'
import { formatCuantiaCLP } from '@/lib/utils/cuantia'
import { formatDateToSpanishWords } from '@/lib/utils/dateFormat'
import { drawRolHeader, type HeaderData } from '@/lib/pdf/header'
import { replaceVariables } from '@/lib/estampos/text'
import { buildEstampoPdf } from '@/lib/estampos/pdf'
import { loadOfficePdfConfig, loadOfficePdfImages, type OfficePdfConfig } from '@/lib/pdf/officeConfig'
import { asJsonObject, getString } from '@/lib/utils/json'
import type { EstampoEjecutado } from '@/lib/estampos/runtime'
import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { loadSerializedNotification } from '@/lib/workflow/notificationView'

export const dynamic = 'force-dynamic'

// Type for diligencia with all relations
const customEstampoDiligenciaInclude = {
  rol: { include: {
    tribunal: { select: { id: true, nombre: true } },
    demanda: { include: {
      abogados: { include: { bancos: { include: { banco: true } } } },
      ejecutados: { include: { comunas: true } },
    } },
  } },
} satisfies Prisma.DiligenciaInclude

type DiligenciaWithRelations = Prisma.DiligenciaGetPayload<{ include: typeof customEstampoDiligenciaInclude }>

function buildEstampoVariables(
  diligencia: DiligenciaWithRelations,
  dbUser: { officeName: string } | null,
  officePdfConfig: Pick<OfficePdfConfig, 'receptorNombre'> | null,
  ejecutadoFromNotificacion?: EstampoEjecutado | null,
  chargedAmount?: number | null
): Record<string, string> {
  const meta = asJsonObject(diligencia.meta)
  const ejecutadoId = getString(meta?.ejecutadoId)

  // Seleccionar ejecutado
  const ejecutados = diligencia.rol.demanda?.ejecutados ?? []
  let ejecutado: EstampoEjecutado | null | undefined
  
  if (ejecutadoFromNotificacion !== undefined) {
    // ejecutadoFromNotificacion was passed (notificacionId was provided)
    // If it's null, route should have already blocked, but handle gracefully
    ejecutado = ejecutadoFromNotificacion ?? null
  } else {
    // Legacy: notificacionId was NOT provided, use legacy behavior
    if (ejecutadoId) {
      ejecutado = ejecutados.find(e => e.id === ejecutadoId) ?? ejecutados[0]
    } else {
      ejecutado = ejecutados[0]
    }
  }

  // Datos del abogado
  const abogado = diligencia.rol.demanda?.abogados
  const banco = abogado?.bancos?.[0]?.banco ?? null

  // Datos del tribunal
  const tribunal = diligencia.rol.tribunal

  // Fecha y hora
  const fechaEjecucion = meta?.fechaEjecucion
    ? new Date(meta.fechaEjecucion as string)
    : diligencia.fecha
  const horaEjecucion = (meta?.horaEjecucion as string) ?? ''

  // Cuantía formateada
  const montoSeleccionadoRaw =
    typeof chargedAmount === 'number'
      ? chargedAmount
      : typeof meta?.monto === 'number'
      ? meta.monto
      : typeof meta?.monto === 'string'
        ? Number(meta.monto.toString().replace(/\./g, '').replace(/\s/g, ''))
        : null
  const montoSeleccionado =
    typeof montoSeleccionadoRaw === 'number' && Number.isFinite(montoSeleccionadoRaw)
      ? montoSeleccionadoRaw
      : null
  const cuantiaRaw = diligencia.rol.demanda?.cuantia
  const cuantiaFormatted = cuantiaRaw ? formatCuantiaCLP(cuantiaRaw) : ''
  const montoEjecutadoFormatted =
    montoSeleccionado !== null
      ? `$${formatCuantiaCLP(montoSeleccionado)}`
      : ''

  // Construir mapa de variables
  return {
    // Ejecutado
    nombre_ejecutado: ejecutado?.nombre ?? '',
    rut_ejecutado: ejecutado?.rut ?? '',
    direccion_ejecutado: [ejecutado?.direccion, ejecutado?.comunas?.nombre]
      .filter(Boolean)
      .join(', '),
    solo_direccion_ejecutado: ejecutado?.direccion ?? '',
    solo_comuna_ejecutado: ejecutado?.comunas?.nombre ?? '',

    // Abogado
    abogado_nombre: abogado?.nombre ?? '',
    abogado_direccion: [abogado?.direccion, abogado?.comuna]
      .filter(Boolean)
      .join(', '),

    // ROL y Tribunal
    rol: diligencia.rol.rol,
    tribunal: tribunal?.nombre ?? '',

    // Carátula
    caratula: [banco?.nombre, ejecutado?.nombre].filter(Boolean).join(' / '),

    // Montos
    cuantia: cuantiaFormatted,
    monto_ejecutado: montoEjecutadoFormatted,

    // Fecha y hora
    fecha_palabras_diligencia: formatDateToSpanishWords(fechaEjecucion),
    hora_diligencia: horaEjecucion,

    // Receptor
    receptor_nombre: officePdfConfig?.receptorNombre ?? dbUser?.officeName ?? 'Receptor Judicial',

    // Placeholders vacíos (para futuro uso)
    n_operacion: getString(meta?.n_operacion) ?? '',
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'post.diligencias.id.estampo', async user => {
  try {

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: user.officeId,
        },
      },
      include: customEstampoDiligenciaInclude,
    })

    if (!diligencia) {
      return apiFailure(new ApiError('NOT_FOUND', 'Diligencia no encontrada o no pertenece a tu oficina', 404))
    }

    const raw = await req.json().catch(() => ({}))
    const notificacionId = typeof raw?.notificacionId === 'string' ? raw.notificacionId : null

    const data = parseApiInput(EstampoGenerateSchema, raw)

    // Store ejecutado from notificación if available
    let ejecutadoFromNotificacion: EstampoEjecutado | undefined
    let notificacionMeta: Prisma.JsonObject = {}
    let chargedAmount: number | null = null

    if (notificacionId) {
      const noti = await prisma.notificacion.findFirst({
        where: { id: notificacionId, diligenciaId: diligencia.id },
        include: {
          ejecutado: {
            include: {
              comunas: {
                select: {
                  id: true,
                  nombre: true,
                },
              },
            },
          },
        },
      })

      if (!noti) {
        return apiFailure(new ApiError('NOT_FOUND', 'Notificación no encontrada', 404))
      }

      if (!noti.ejecutadoId || !noti.ejecutado) {
        return apiFailure(new ApiError('VALIDATION_ERROR', 'Esta notificación requiere seleccionar un ejecutado antes de generar documentos.', 400))
      }

      ejecutadoFromNotificacion = noti.ejecutado
      notificacionMeta = (asJsonObject(noti.meta) ?? {}) as Prisma.JsonObject
      const activeReceipt = await prisma.recibo.findFirst({
        where: { notificacionId: noti.id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        select: { monto: true },
      })
      chargedAmount = activeReceipt ? Number(activeReceipt.monto) : null
    }

    const estampo = await prisma.estampo.findFirst({
      where: {
        id: data.estampoId,
        officeId: user.officeId,
      },
    })

    if (!estampo) {
      return apiFailure(new ApiError('NOT_FOUND', 'Estampo no encontrado en tu oficina', 404))
    }

    const template = data.contenidoPersonalizado
      ? data.contenidoPersonalizado
      : (estampo.contenido || 'Estampo generado para $rol')

    const [officeImages, officePdfConfig] = await Promise.all([
      loadOfficePdfImages({ officeId: user.officeId, officeCacheRevision: user.officeCacheRevision }),
      loadOfficePdfConfig({ officeId: user.officeId, officeCacheRevision: user.officeCacheRevision, fallbackReceptorNombre: user.officeName }),
    ])

    // Build complete variable map from diligencia data
    const effectiveDiligencia = {
      ...diligencia,
      meta: { ...(asJsonObject(diligencia.meta) ?? {}), ...notificacionMeta } as Prisma.JsonObject,
    }
    const variableMap = buildEstampoVariables(
      effectiveDiligencia,
      user,
      officePdfConfig,
      ejecutadoFromNotificacion,
      chargedAmount
    )
    const filled = replaceVariables(template, variableMap)

    // Get ejecutadoNombre for header (from variableMap)
    const ejecutadoNombre = variableMap.nombre_ejecutado || null

    // Extract header data
    const headerData: HeaderData = {
      receptorNombre: officePdfConfig.receptorNombre,
      tribunalNombre: diligencia.rol.tribunal?.nombre ?? null,
      rolNumero: diligencia.rol.rol,
      bancoNombre: diligencia.rol.demanda?.abogados?.bancos?.[0]?.banco?.nombre ?? null,
      ejecutadoNombre,
    }

    const pdfBase64 = await buildEstampoPdf(filled, headerData, officeImages)
    const generationMetadata = buildDocumentGenerationMetadata({
      userId: user.id,
      sourceTemplate: {
        type: 'custom-estampo',
        estampoId: estampo.id,
        name: estampo.nombre,
        version: 1,
      },
      variables: variableMap,
    })

    const documento = await prisma.documento.create({
      data: {
        rolId: diligencia.rolId,
        diligenciaId: diligencia.id,
        notificacionId: notificacionId ?? null,
        estampoId: estampo.id,
        nombre: `Estampo ${estampo.nombre}`,
        tipo: 'Estampo',
        pdfId: null,
        version: 1,
        ...generationMetadata,
      },
    })
    const storedPdf = await uploadPdfToDocumentStorage({
      pdfBase64,
      officeId: user.officeId,
      rolId: diligencia.rolId,
      documentoId: documento.id,
      versionNumber: 1,
      fileName: documento.nombre,
      createdAt: documento.createdAt,
    })
    const documentoWithVersion = await prisma.$transaction(async tx => {
      const documentVersion = await tx.documentoVersion.create({
        data: { documentoId: documento.id, versionNumber: 1, ...storedPdf, createdByUserId: user.id },
      })
      const updated = await tx.documento.update({
        where: { id: documento.id }, data: { currentVersionId: documentVersion.id }, include: { currentVersion: true },
      })
      if (notificacionId) {
        await tx.notificacion.update({
          where: { id: notificacionId },
          data: { meta: { ...notificacionMeta, estampoDraft: filled } },
        })
      }
      const queuedEvent = await enqueueExternalEvent(tx, user, {
        eventType: 'stamp.generated', module: 'documents', result: 'success',
        recordType: 'Documento', recordId: updated.id, rolId: diligencia.rolId, rol: diligencia.rol.rol,
        description: 'Estampo generado.', deduplicationKey: `stamp:${documentVersion.id}:generated`,
        metadata: { documentId: updated.id, documentVersionId: documentVersion.id, templateId: estampo.id, templateSlug: `custom-${estampo.id}`, templateCategory: estampo.tipo, notificationId: notificacionId, version: 1 },
      })
      return { documento: updated, outboxId: queuedEvent.id }
    })
    await processActivityOutbox(1, documentoWithVersion.outboxId).catch(() => undefined)
    const completedDocumento = documentoWithVersion.documento
    const serializedNotificacion = notificacionId
      ? await loadSerializedNotification(notificacionId, diligencia.id)
      : null

    return NextResponse.json({
      ok: true,
      data: {
        documento: {
          id: completedDocumento.id,
          nombre: completedDocumento.nombre,
          tipo: completedDocumento.tipo,
          version: completedDocumento.version,
          hasPdf: hasStoredPdf(completedDocumento),
          createdAt: completedDocumento.createdAt.toISOString(),
          diligenciaId: completedDocumento.diligenciaId,
          notificacionId: completedDocumento.notificacionId,
          voidedAt: null,
          voidReason: null,
          voidedByUserId: null,
          generatedByUserId: completedDocumento.generatedByUserId,
          generatedAt: completedDocumento.generatedAt ? completedDocumento.generatedAt.toISOString() : null,
          sourceTemplate: completedDocumento.sourceTemplate,
          generationVariables: completedDocumento.generationVariables,
          generationVersion: completedDocumento.generationVersion,
          diligencia: { id: diligencia.id, tipo: null },
          estampo: { id: estampo.id, nombre: estampo.nombre, tipo: estampo.tipo },
          estampoBase: null,
        },
        notificacion: serializedNotificacion,
      },
    })
  } catch (error) {
    return apiFailure(new ApiError('INTERNAL_ERROR', 'Ocurrió un error inesperado', 500))
  }

  })
}

