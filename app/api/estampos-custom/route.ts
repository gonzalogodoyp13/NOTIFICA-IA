import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { validateRequiredVariables } from '@/lib/estampos/variables'
import type { VariableDef, WizardQuestion } from '@/lib/estampos/types'

export const dynamic = 'force-dynamic'

// Schema for POST /api/estampos-custom
const CreateCustomSchema = z.object({
  baseId: z.number().int().positive(),
  textoTemplate: z.string(),
  // NOTE: officeId is NEVER accepted from client - always from session
})

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    return handleCreateOrUpdate(req, body, user.officeId)
  } catch (error) {
    console.error('Error en POST /api/estampos-custom:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al procesar la solicitud' },
      { status: 500 }
    )
  }
}

async function handleCreateOrUpdate(
  req: NextRequest,
  body: unknown,
  officeId: number
): Promise<NextResponse> {
  const parsed = CreateCustomSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Datos inválidos', details: parsed.error.format() },
      { status: 400 }
    )
  }

  const { baseId, textoTemplate } = parsed.data

  // Load EstampoBase by baseId (verify exists and active)
  const estampoBase = await prisma.estampoBase.findFirst({
    where: {
      id: baseId,
      isActive: true,
    },
  })

  if (!estampoBase) {
    return NextResponse.json(
      { ok: false, error: 'Estampo base no encontrado o inactivo' },
      { status: 404 }
    )
  }

  // Extract variablesSchema from base
  const variablesSchema = estampoBase.variablesSchema as unknown as VariableDef[]

  // Load wizardSchema to identify wizard variables
  const wizardSchema = estampoBase.wizardSchema as unknown as WizardQuestion[]
  const wizardVars = new Set(wizardSchema.map((q) => q.variable))

  // Only validate variables that must appear in template:
  // - required === true
  // - NOT a wizard variable
  // - NOT a derived variable
  const requiredVars = variablesSchema
    .filter((v) => {
      if (!v.required) return false
      if (wizardVars.has(v.name)) return false  // Exclude wizard vars
      if (v.source === 'DERIVED') return false  // Exclude derived vars (confirmed: uses 'DERIVED')
      return true
    })
    .map((v) => v.name)

  // Validate template using validateRequiredVariables helper
  const validation = validateRequiredVariables(textoTemplate, requiredVars)

  if (!validation.valid) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Faltan variables requeridas',
        missing: validation.missing,
      },
      { status: 400 }
    )
  }

  // Upsert EstampoCustom
  // Security: Always use officeId from session
  const estampoCustom = await prisma.estampoCustom.upsert({
    where: {
      EstampoCustom_base_office_unique: {
        baseId,
        officeId,
      },
    },
    create: {
      baseId,
      officeId,
      textoTemplate,
      isDefaultForOffice: true,
      isActive: true,
      version: 1,
    },
    update: {
      textoTemplate,
      version: { increment: 1 },
      isActive: true,
    },
  })

  return NextResponse.json({
    ok: true,
    data: {
      id: estampoCustom.id,
      baseId: estampoCustom.baseId,
      textoTemplate: estampoCustom.textoTemplate,
      version: estampoCustom.version,
    },
  })
}

