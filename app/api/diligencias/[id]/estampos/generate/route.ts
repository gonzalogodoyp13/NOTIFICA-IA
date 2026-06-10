import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { buildDocumentGenerationMetadata } from '@/lib/documents/generationMetadata'
import { hasStoredPdf, uploadPdfToDocumentStorage } from '@/lib/documents/storage'
import { prisma } from '@/lib/prisma'
import { loadOfficePdfConfig, loadOfficePdfImages } from '@/lib/pdf/officeConfig'
import { buildWizardInitialVariables, loadWizardDiligenciaContext, loadWizardEstampoTemplate } from '@/lib/estampos/server'
import { computeDerivedVariables, renderEstampoTemplate, type DiligenciaWithRelations } from '@/lib/estampos/runtime'
import { buildEstampoPdf } from '@/lib/estampos/pdf'
import { type HeaderData } from '@/lib/pdf/header'
import type { VariableDef } from '@/lib/estampos/types'

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
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = GenerateEstampoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Datos inválidos', details: parsed.error.format() },
        { status: 400 }
      )
    }

    const { estampoBaseId, wizardAnswers, textoEditado, notificacionId } = parsed.data

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
      }),
    ])

    if (!context) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    if ('error' in context) {
      const status = context.error === 'Notificación no encontrada' ? 404 : 400
      return NextResponse.json({ ok: false, error: context.error }, { status })
    }

    if (!templateBundle) {
      return NextResponse.json(
        { ok: false, error: 'Estampo no encontrado o inactivo' },
        { status: 404 }
      )
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
        return NextResponse.json(
          {
            ok: false,
            error: 'Faltan variables requeridas',
            missing,
          },
          { status: 400 }
        )
      }

      finalText = renderEstampoTemplate(textoTemplate, finalVariables)
    }

    const [officeImages, officePdfConfig] = await Promise.all([
      loadOfficePdfImages(user.officeId),
      loadOfficePdfConfig(user.officeId, dbUser?.officeName ?? null),
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
    const documentVersion = await prisma.documentoVersion.create({
      data: {
        documentoId: documento.id,
        versionNumber: 1,
        ...storedPdf,
        createdByUserId: user.id,
      },
    })
    const documentoWithVersion = await prisma.documento.update({
      where: { id: documento.id },
      data: { currentVersionId: documentVersion.id },
      include: { currentVersion: true },
    })

    return NextResponse.json({
      ok: true,
      data: {
        documento: {
          id: documentoWithVersion.id,
          nombre: documentoWithVersion.nombre,
          tipo: documentoWithVersion.tipo,
          version: documentoWithVersion.version,
          hasPdf: hasStoredPdf(documentoWithVersion),
          createdAt: documentoWithVersion.createdAt.toISOString(),
          diligenciaId: documentoWithVersion.diligenciaId,
          notificacionId: documentoWithVersion.notificacionId,
          voidedAt: null,
          voidReason: null,
          voidedByUserId: null,
          generatedByUserId: documentoWithVersion.generatedByUserId,
          generatedAt: documentoWithVersion.generatedAt ? documentoWithVersion.generatedAt.toISOString() : null,
          sourceTemplate: documentoWithVersion.sourceTemplate,
          generationVariables: documentoWithVersion.generationVariables,
          generationVersion: documentoWithVersion.generationVersion,
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
      },
    })
  } catch (error) {
    console.error('Error generando estampo:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al generar el estampo' },
      { status: 500 }
    )
  }
}
