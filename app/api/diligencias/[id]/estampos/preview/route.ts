import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import {
  buildInitialVariables,
  computeDerivedVariables,
  renderEstampoTemplate,
  type DiligenciaWithRelations,
} from '@/lib/estampos/runtime'
import type { VariableDef } from '@/lib/estampos/types'

export const dynamic = 'force-dynamic'

// Input validation schema
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

    // Get user with officeName from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { officeName: true },
    })

    // Parse and validate input
    const body = await req.json()
    const parsed = PreviewEstampoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Datos inválidos', details: parsed.error.format() },
        { status: 400 }
      )
    }

    const { estampoBaseId, wizardAnswers } = parsed.data

    // Load diligencia with all relations (same pattern as generate route)
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
            tribunal: {
              select: {
                id: true,
                nombre: true,
              },
            },
            demanda: {
              include: {
                abogados: {
                  include: {
                    banco: true,
                  },
                },
                ejecutados: {
                  include: {
                    comunas: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Cast to DiligenciaWithRelations - we know the include matches the expected structure
    const diligenciaWithRelations = diligencia as DiligenciaWithRelations

    // Load EstampoBase
    const estampoBase = await prisma.estampoBase.findFirst({
      where: {
        id: estampoBaseId,
        isActive: true,
      },
    })

    if (!estampoBase) {
      return NextResponse.json(
        { ok: false, error: 'Estampo no encontrado o inactivo' },
        { status: 404 }
      )
    }

    // CRITICAL: Resolve template using EXACT same logic as generate route
    // Load EstampoCustom if exists
    const estampoCustom = await prisma.estampoCustom.findFirst({
      where: {
        baseId: estampoBase.id,
        officeId: user.officeId,
        isActive: true,
      },
    })

    // Determine final textoTemplate (custom overrides base) - same as generate route
    const textoTemplate = estampoCustom?.textoTemplate ?? estampoBase.textoTemplate

    // Build complete variables using runtime helpers (do not modify)
    const initialVariables = buildInitialVariables({
      diligencia: diligenciaWithRelations,
      rol: diligenciaWithRelations.rol,
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

    // Render template using runtime helper (do not modify)
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

