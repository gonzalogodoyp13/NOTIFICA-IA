import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import type { VariableDef, WizardQuestion } from '@/lib/estampos/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    // Fetch all active EstampoBase
    const estamposBase = await prisma.estampoBase.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        nombreVisible: 'asc',
      },
    })

    // For each base, check if EstampoCustom exists for user's office
    const estamposWithCustoms = await Promise.all(
      estamposBase.map(async estampoBase => {
        // Security: Always filter by officeId from session, never from client
        const estampoCustom = await prisma.estampoCustom.findFirst({
          where: {
            baseId: estampoBase.id,
            officeId: user.officeId,
            isActive: true,
          },
        })

        const textoTemplate = estampoCustom?.textoTemplate ?? estampoBase.textoTemplate
        const hasCustom = !!estampoCustom

        return {
          id: estampoBase.id,
          slug: estampoBase.slug,
          nombreVisible: estampoBase.nombreVisible,
          categoria: estampoBase.categoria,
          descripcion: estampoBase.descripcion,
          textoTemplate,
          variablesSchema: estampoBase.variablesSchema as unknown as VariableDef[],
          wizardSchema: estampoBase.wizardSchema as unknown as WizardQuestion[],
          hasCustom,
          customId: estampoCustom?.id ?? undefined,
        }
      })
    )

    return NextResponse.json({
      ok: true,
      data: {
        estampos: estamposWithCustoms,
      },
    })
  } catch (error) {
    console.error('Error en GET /api/ajustes/estampos/wizard:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener estampos para el wizard' },
      { status: 500 }
    )
  }
}

