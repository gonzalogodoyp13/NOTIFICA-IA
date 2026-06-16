import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { ApiError, apiFailure, parseApiInput } from '@/lib/api/server'
import { buildDocumentGenerationMetadata } from '@/lib/documents/generationMetadata'
import { hasStoredPdf, uploadPdfToDocumentStorage } from '@/lib/documents/storage'
import { prisma } from '@/lib/prisma'
import { ReciboGenerateSchema } from '@/lib/validations/rol-workspace'
import { buildReciboVariables, buildReciboPdf, loadOfficeReciboStampForPdf } from '@/lib/pdf/recibo'
import { loadOfficePdfConfig } from '@/lib/pdf/officeConfig'
import type { DiligenciaWithReciboRelations } from '@/lib/pdf/recibo'

export const dynamic = 'force-dynamic'

const reciboNotificationInclude = {
  ejecutado: { include: { comunas: { select: { id: true, nombre: true } } } },
} satisfies Prisma.NotificacionInclude

type ReciboNotification = Prisma.NotificacionGetPayload<{ include: typeof reciboNotificationInclude }>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseBusinessDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getFechaEjecucionFromMeta(meta: unknown) {
  if (!isPlainObject(meta)) {
    return null
  }

  const direct = parseBusinessDate(meta.fechaEjecucion)
  if (direct) {
    return direct
  }

  const ejecucion = isPlainObject(meta.ejecucion) ? meta.ejecucion : null
  return parseBusinessDate(ejecucion?.fecha)
}

function formatNumeroRecibo(year: number, sequence: number) {
  return `R-${year}-${String(sequence).padStart(6, '0')}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return apiFailure(new ApiError('UNAUTHORIZED', 'No autorizado', 401))
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { officeName: true },
    })

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: user.officeId,
        },
      },
      include: {
        rol: {
          include: {
            tribunal: true,
            demanda: {
              include: {
                abogados: {
                  include: {
                    bancos: {
                      include: {
                        banco: true,
                      },
                    },
                  },
                },
                ejecutados: {
                  include: { comunas: true },
                },
              },
            },
          },
        },
        tipo: {
          select: { nombre: true },
        },
      },
    }) as DiligenciaWithReciboRelations | null

    if (!diligencia) {
      return apiFailure(new ApiError('NOT_FOUND', 'Diligencia no encontrada o no pertenece a tu oficina', 404))
    }

    const raw = await req.json().catch(() => ({}))
    const notificacionId = typeof raw?.notificacionId === 'string' ? raw.notificacionId : null

    const data = parseApiInput(ReciboGenerateSchema, raw)

    let ejecutadoFromNotificacion: ReciboNotification['ejecutado'] | undefined
    let notificacionMeta: unknown = null

    if (notificacionId) {
      const noti = await prisma.notificacion.findFirst({
        where: { id: notificacionId, diligenciaId: diligencia.id },
        include: reciboNotificationInclude,
      })

      if (!noti) {
        return apiFailure(new ApiError('NOT_FOUND', 'Notificación no encontrada', 404))
      }

      if (!noti.ejecutadoId || !noti.ejecutado) {
        return apiFailure(new ApiError('VALIDATION_ERROR', 'Esta notificación requiere seleccionar un ejecutado antes de generar documentos.', 400))
      }

      ejecutadoFromNotificacion = noti.ejecutado
      notificacionMeta = noti.meta ?? null
    }

    const fechaEjecucion =
      getFechaEjecucionFromMeta(notificacionMeta) ??
      getFechaEjecucionFromMeta(diligencia.meta)

    if (!fechaEjecucion) {
      return apiFailure(new ApiError('VALIDATION_ERROR', 'Debes registrar la fecha de ejecución antes de generar el recibo.', 400))
    }

    const fechaRecibo = new Date()
    const numeroReciboYear = fechaRecibo.getFullYear()
    const [stampBytes, officePdfConfig] = await Promise.all([
      loadOfficeReciboStampForPdf(user.officeId),
      loadOfficePdfConfig(user.officeId, dbUser?.officeName ?? null),
    ])

    const result = await prisma.$transaction(async tx => {
      if (notificacionId) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`recibo-notificacion-${notificacionId}`}))
        `

        const existingDocumento = await tx.documento.findFirst({
          where: {
            notificacionId,
            tipo: 'Recibo',
            voidedAt: null,
            OR: [
              { pdfId: { not: null } },
              { currentVersion: { is: { deletedAt: null } } },
            ],
          },
          include: {
            currentVersion: true,
          },
          orderBy: { createdAt: 'desc' },
        })

        if (existingDocumento && hasStoredPdf(existingDocumento) && data.regenerate !== true) {
          const existingRecibo = await tx.recibo.findFirst({
            where: {
              notificacionId,
              documentoId: existingDocumento.id,
            },
            orderBy: { createdAt: 'desc' },
          })

          return {
            kind: 'conflict' as const,
            existing: {
              reciboId: existingRecibo?.id ?? null,
              documentoId: existingDocumento.id,
              numeroRecibo: existingRecibo?.numeroRecibo ?? null,
              createdAt: existingDocumento.createdAt.toISOString(),
            },
          }
        }
      }

      const sequenceRows = await tx.$queryRaw<Array<{ assignedNumber: number }>>`
        INSERT INTO "DocumentNumberSequence" (
          "id",
          "officeId",
          "year",
          "documentType",
          "nextNumber"
        )
        VALUES (
          ${`recibo-${user.officeId}-${numeroReciboYear}`},
          ${user.officeId},
          ${numeroReciboYear},
          'RECIBO'::"DocumentType",
          2
        )
        ON CONFLICT ("officeId", "year", "documentType")
        DO UPDATE SET
          "nextNumber" = "DocumentNumberSequence"."nextNumber" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "nextNumber" - 1 AS "assignedNumber"
      `

      const assignedNumber = Number(sequenceRows[0]?.assignedNumber)

      if (!Number.isInteger(assignedNumber) || assignedNumber < 1) {
        throw new Error('No se pudo asignar un numero de recibo valido.')
      }

      const numeroRecibo = formatNumeroRecibo(numeroReciboYear, assignedNumber)
      const variables = buildReciboVariables(
        diligencia,
        dbUser,
        officePdfConfig,
        numeroRecibo,
        data.monto,
        data.medio,
        fechaEjecucion,
        data.referencia,
        data.tipoEstampoNombre,
        ejecutadoFromNotificacion,
        data.otros ?? 0
      )
      const pdfBase64 = await buildReciboPdf(variables, stampBytes)
      const numeroBoleta = data.referencia?.trim() || variables.n_operacion.trim() || null
      const generationMetadata = buildDocumentGenerationMetadata({
        userId: user.id,
        generatedAt: fechaRecibo,
        sourceTemplate: {
          type: 'recibo',
          name: 'default-recibo-pdf',
          version: 1,
        },
        variables,
      })

      const existingLogicalDocumento =
        notificacionId && data.regenerate === true
          ? await tx.documento.findFirst({
              where: {
                notificacionId,
                tipo: 'Recibo',
                voidedAt: null,
              },
              orderBy: { createdAt: 'desc' },
            })
          : null

      const documento = existingLogicalDocumento
        ? await tx.documento.update({
            where: { id: existingLogicalDocumento.id },
            data: {
              nombre: `Recibo ${variables.numero_recibo}`,
              version: { increment: 1 },
              ...generationMetadata,
            },
          })
        : await tx.documento.create({
            data: {
              rolId: diligencia.rolId,
              diligenciaId: diligencia.id,
              notificacionId: notificacionId ?? null,
              nombre: `Recibo ${variables.numero_recibo}`,
              tipo: 'Recibo',
              pdfId: null,
              version: 1,
              ...generationMetadata,
            },
          })

      const latestVersion = await tx.documentoVersion.findFirst({
        where: { documentoId: documento.id },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      })
      const nextVersionNumber = Math.max(
        latestVersion?.versionNumber ?? 0,
        existingLogicalDocumento?.version ?? 0
      ) + 1
      const storedPdf = await uploadPdfToDocumentStorage({
        pdfBase64,
        officeId: user.officeId,
        rolId: diligencia.rolId,
        documentoId: documento.id,
        versionNumber: nextVersionNumber,
        fileName: documento.nombre,
        createdAt: fechaRecibo,
      })
      const documentVersion = await tx.documentoVersion.create({
        data: {
          documentoId: documento.id,
          versionNumber: nextVersionNumber,
          ...storedPdf,
          createdAt: fechaRecibo,
          createdByUserId: user.id,
        },
      })
      const createdDocumento = await tx.documento.update({
        where: { id: documento.id },
        data: {
          currentVersionId: documentVersion.id,
          version: nextVersionNumber,
        },
        include: {
          currentVersion: true,
        },
      })

      await tx.recibo.create({
        data: {
          rolId: diligencia.rolId,
          officeId: user.officeId,
          diligenciaId: diligencia.id,
          notificacionId: notificacionId ?? null,
          documentoId: createdDocumento.id,
          documentVersionId: documentVersion.id,
          numeroRecibo: variables.numero_recibo,
          numeroReciboYear,
          numeroBoleta,
          monto: data.monto,
          medio: data.medio,
          ref: data.referencia ?? null,
          fechaEjecucion,
          fechaRecibo,
        },
      })

      await tx.diligencia.update({
        where: { id: diligencia.id },
        data: {
          estadoCobro: 'NO_PAGADO',
        },
      })

      return {
        kind: 'created' as const,
        documento: createdDocumento,
      }
    })

    if (result.kind === 'conflict') {
      return apiFailure(new ApiError('CONFLICT', 'Ya existe un recibo para esta notificación.', 409))
    }

    const documento = result.documento

    return NextResponse.json({
      ok: true,
      data: {
        id: documento.id,
        nombre: documento.nombre,
        tipo: documento.tipo,
        version: documento.version,
        hasPdf: hasStoredPdf(documento),
        createdAt: documento.createdAt.toISOString(),
        diligenciaId: documento.diligenciaId,
        notificacionId: documento.notificacionId,
        voidedAt: null,
        voidReason: null,
        voidedByUserId: null,
        generatedByUserId: documento.generatedByUserId,
        generatedAt: documento.generatedAt ? documento.generatedAt.toISOString() : null,
        sourceTemplate: documento.sourceTemplate,
        generationVariables: documento.generationVariables,
        generationVersion: documento.generationVersion,
        diligencia: {
          id: diligencia.id,
          tipo: diligencia.tipo?.nombre ?? null,
        },
        estampo: null,
        estampoBase: null,
      },
    })
  } catch (error) {
    console.error('Error generando recibo:', error)
    return apiFailure(new ApiError('INTERNAL_ERROR', 'Ocurrió un error inesperado', 500))
  }
}
