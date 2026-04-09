import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
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

    const firmaPath = path.resolve('./public/mock-firma.png')
    const selloPath = path.resolve('./public/mock-sello.png')
    const officeImages: { firma?: Uint8Array; sello?: Uint8Array } = {}

    if (fs.existsSync(firmaPath)) {
      officeImages.firma = await fs.promises.readFile(firmaPath)
    }

    if (fs.existsSync(selloPath)) {
      officeImages.sello = await fs.promises.readFile(selloPath)
    }

    const headerData: HeaderData = {
      receptorNombre: dbUser?.officeName ?? 'Receptor Judicial',
      tribunalNombre: diligencia.rol.tribunal?.nombre ?? null,
      rolNumero: diligencia.rol.rol,
      bancoNombre: diligencia.rol.demanda?.abogados?.bancos?.[0]?.banco?.nombre ?? null,
      ejecutadoNombre: finalVariables.nombre_ejecutado || null,
    }

    const pdfBase64 = await buildEstampoPdf(finalText, headerData, officeImages)

    const documento = await prisma.documento.create({
      data: {
        rolId: diligencia.rolId,
        diligenciaId: diligencia.id,
        notificacionId: notificacionId ?? null,
        estampoBaseId,
        nombre: `Estampo ${estampoBase.nombreVisible}`,
        tipo: 'Estampo',
        pdfId: pdfBase64,
        textoEditado: textoEditado || null,
        version: 1,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        documento: {
          id: documento.id,
          nombre: documento.nombre,
          tipo: documento.tipo,
          version: documento.version,
          hasPdf: !!documento.pdfId,
          createdAt: documento.createdAt.toISOString(),
          diligenciaId: documento.diligenciaId,
          notificacionId: documento.notificacionId,
          voidedAt: null,
          voidReason: null,
          voidedByUserId: null,
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
