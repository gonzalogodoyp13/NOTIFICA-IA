import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { buildWizardInitialVariables, loadWizardDiligenciaContext, loadWizardEstampoTemplate } from '@/lib/estampos/server'
import { computeDerivedVariables, renderEstampoTemplate } from '@/lib/estampos/runtime'
import type { VariableDef } from '@/lib/estampos/types'

export const dynamic = 'force-dynamic'

const PreviewEstampoSchema = z.object({
  estampoBaseId: z.number().int().positive(),
  wizardAnswers: z.record(z.string(), z.string()),
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
    const parsed = PreviewEstampoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Datos inválidos', details: parsed.error.format() },
        { status: 400 }
      )
    }

    const { estampoBaseId, wizardAnswers } = parsed.data

    const [context, templateBundle] = await Promise.all([
      loadWizardDiligenciaContext({
        diligenciaId: params.id,
        officeId: user.officeId,
        userId: user.id,
      }),
      loadWizardEstampoTemplate({
        estampoBaseId,
        officeId: user.officeId,
      }),
    ])

    if (!context || 'error' in context) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    if (!templateBundle) {
      return NextResponse.json(
        { ok: false, error: 'Estampo no encontrado o inactivo' },
        { status: 404 }
      )
    }

    const { dbUser, diligencia } = context
    const { estampoBase, estampoCustom, textoTemplate } = templateBundle

    const initialVariables = buildWizardInitialVariables({
      diligencia,
      rol: diligencia.rol,
      estampoBase,
      estampoCustom,
      dbUser,
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

    const renderedText = renderEstampoTemplate(textoTemplate, finalVariables)

    return NextResponse.json({
      ok: true,
      data: {
        renderedText,
      },
    })
  } catch (error) {
    console.error('Error en POST /estampos/preview:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al generar vista previa' },
      { status: 500 }
    )
  }
}
