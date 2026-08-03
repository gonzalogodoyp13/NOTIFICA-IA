import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { ApiError, apiFailure, handleApiError, parseApiInput, withApiUser } from '@/lib/api/server'
import { buildDocumentGenerationMetadata } from '@/lib/documents/generationMetadata'
import { hasStoredPdf, uploadPdfToDocumentStorage } from '@/lib/documents/storage'
import { prisma } from '@/lib/prisma'
import { loadOfficePdfConfig, loadOfficePdfImages } from '@/lib/pdf/officeConfig'
import { buildWizardInitialVariables, loadWizardDiligenciaContext, loadWizardEstampoTemplate } from '@/lib/estampos/server'
import { computeDerivedVariables, renderEstampoTemplate, type DiligenciaWithRelations } from '@/lib/estampos/runtime'
import { buildEstampoPdf } from '@/lib/estampos/pdf'
import { type HeaderData } from '@/lib/pdf/header'
import type { VariableDef } from '@/lib/estampos/types'
import { loadSerializedNotification } from '@/lib/workflow/notificationView'

export const dynamic = 'force-dynamic'

const GenerateEstampoSchema = z.object({
  estampoBaseId: z.number().int().positive(),
  wizardAnswers: z.record(z.string(), z.string()),
  textoEditado: z.string().optional(),
  notificacionId: z.string().optional().nullable(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'stamp.generate', async user => {
   try {

    const body = await req.json()
    const { estampoBaseId, wizardAnswers, textoEditado, notificacionId } = parseApiInput(GenerateEstampoSchema, body)

    const [context, templateBundle] = await Promise.all([
      loadWizardDiligenciaContext({
        diligenciaId: params.id,
        officeId: user.officeId,
        userId: user.id,
        notificacionId,
      }),
      loadWizardEstampoTemplate({
        estampoBaseId,
        officeId: user.officeId,
        officeCacheRevision: user.officeCacheRevision,
      }),
    ])

    if (!context) {
      return apiFailure(new ApiError('NOT_FOUND', 'Diligencia no encontrada o no pertenece a tu oficina', 404))
    }

    if ('error' in context) {
      const message = context.error ?? 'No se pudo cargar el contexto de la diligencia'
      const status = message === 'Notificación no encontrada' ? 404 : 400
      return apiFailure(new ApiError(status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR', message, status))
    }

    if (!templateBundle) {
      return apiFailure(new ApiError('NOT_FOUND', 'Estampo no encontrado o inactivo', 404))
    }

    const { dbUser, diligencia, ejecutadoFromNotificacion, notificacionMeta } = context
    const { estampoBase, estampoCustom, textoTemplate } = templateBundle

    const initialVariables = buildWizardInitialVariables({
      diligencia: diligencia as DiligenciaWithRelations,
      rol: diligencia.rol,
      estampoBase,
      estampoCustom,
      dbUser,
      notificacionMeta,
      ejecutadoFromNotificacion,
    })

    const combined = {
      ...initialVariables,
      ...wizardAnswers,
    }

    const variablesSchema = estampoBase.variablesSchema as unknown as VariableDef[]
    const derived = computeDerivedVariables(combined, variablesSchema)
    const finalVariables = {
      ...combined,
      ...derived,
    }

    let finalText: string

    if (textoEditado && textoEditado.trim() !== '') {
      finalText = textoEditado
    } else {
      const requiredVariables = variablesSchema.filter(v => v.required)
      const missing: string[] = []

      for (const variableDef of requiredVariables) {
        const value = finalVariables[variableDef.name]
        if (!value || value.trim() === '') {
          missing.push(variableDef.name)
        }
      }

      if (missing.length > 0) {
        return apiFailure(new ApiError(
          'VALIDATION_ERROR',
          'Faltan variables requeridas',
          400,
          { variables: missing }
        ))
      }

      finalText = renderEstampoTemplate(textoTemplate, finalVariables)
    }

    const [officeImages, officePdfConfig] = await Promise.all([
      loadOfficePdfImages({ officeId: user.officeId, officeCacheRevision: user.officeCacheRevision }),
      loadOfficePdfConfig({ officeId: user.officeId, officeCacheRevision: user.officeCacheRevision, fallbackReceptorNombre: dbUser?.officeName ?? null }),
    ])

    const headerData: HeaderData = {
      receptorNombre: officePdfConfig.receptorNombre,
      tribunalNombre: diligencia.rol.tribunal?.nombre ?? null,
      rolNumero: diligencia.rol.rol,
      bancoNombre: diligencia.rol.demanda?.abogados?.bancos?.[0]?.banco?.nombre ?? null,
      ejecutadoNombre: finalVariables.nombre_ejecutado || null,
    }

    const pdfBase64 = await buildEstampoPdf(finalText, headerData, officeImages)
    const generationMetadata = buildDocumentGenerationMetadata({
      userId: user.id,
      sourceTemplate: {
        type: 'wizard-estampo',
        estampoBaseId: estampoBase.id,
        slug: estampoBase.slug,
        categoria: estampoBase.categoria,
        customized: !!estampoCustom || !!textoEditado,
        version: 1,
      },
      variables: finalVariables,
    })

    const documento = await prisma.documento.create({
      data: {
        rolId: diligencia.rolId,
        diligenciaId: diligencia.id,
        notificacionId: notificacionId ?? null,
        estampoBaseId,
        nombre: `Estampo ${estampoBase.nombreVisible}`,
        tipo: 'Estampo',
        pdfId: null,
        textoEditado: textoEditado || null,
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
        data: {
          documentoId: documento.id,
          versionNumber: 1,
          ...storedPdf,
          createdByUserId: user.id,
        },
      })
      const updated = await tx.documento.update({
        where: { id: documento.id },
        data: { currentVersionId: documentVersion.id },
        include: { currentVersion: true },
      })
      const queuedEvent = await enqueueExternalEvent(tx, user, {
        eventType: 'stamp.generated',
        module: 'documents',
        result: 'success',
        recordType: 'Documento',
        recordId: updated.id,
        rolId: diligencia.rolId,
        rol: diligencia.rol.rol,
        description: 'Estampo generado.',
        deduplicationKey: `stamp:${documentVersion.id}:generated`,
        metadata: {
          documentId: updated.id,
          documentVersionId: documentVersion.id,
          templateId: estampoBase.id,
          templateSlug: estampoBase.slug,
          templateCategory: estampoBase.categoria,
          notificationId: notificacionId ?? null,
          version: 1,
        },
      })
      return { documento: updated, outboxId: queuedEvent.id }
    })
    await processActivityOutbox(1, documentoWithVersion.outboxId).catch(error => {
      console.error('[stamp] Immediate activity outbox drain failed:', error)
    })
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
          diligencia: {
            id: diligencia.id,
            tipo: null,
          },
          estampo: null,
          estampoBase: {
            id: estampoBase.id,
            slug: estampoBase.slug,
            nombreVisible: estampoBase.nombreVisible,
            categoria: estampoBase.categoria,
          },
        },
        notificacion: serializedNotificacion,
      },
    })
  } catch (error) {
    return handleApiError(error, { operation: 'stamp.generate', request: req })
  }
  })
}
