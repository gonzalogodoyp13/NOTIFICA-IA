import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { buildInitialVariables, type DiligenciaWithRelations } from '@/lib/estampos/runtime'
import type { VariableDef, WizardQuestion } from '@/lib/estampos/types'

export const dynamic = 'force-dynamic'

export async function GET(
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

    // Load diligencia with all relations (same pattern as legacy route)
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
                    bancos: {
                      include: {
                        banco: true,
                      },
                    },
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

    // Get categoria from query param, default to BUSQUEDA_NEGATIVA for backward compatibility
    const searchParams = req.nextUrl.searchParams
    const categoria = searchParams.get('categoria') || 'BUSQUEDA_NEGATIVA'

    // Fetch EstampoBase for the specified categoria
    const estamposBase = await prisma.estampoBase.findMany({
      where: {
        categoria,
        isActive: true,
      },
      orderBy: {
        nombreVisible: 'asc',
      },
    })

    // For each EstampoBase, resolve EstampoCustom
    const estamposWithCustoms = await Promise.all(
      estamposBase.map(async estampoBase => {
        const estampoCustom = await prisma.estampoCustom.findFirst({
          where: {
            baseId: estampoBase.id,
            officeId: user.officeId,
            isActive: true,
          },
        })

        const textoTemplate = estampoCustom?.textoTemplate ?? estampoBase.textoTemplate
        const hasCustomTemplate = !!estampoCustom

        return {
          id: estampoBase.id,
          slug: estampoBase.slug,
          nombreVisible: estampoBase.nombreVisible,
          categoria: estampoBase.categoria,
          descripcion: estampoBase.descripcion,
          textoTemplate,
          variablesSchema: estampoBase.variablesSchema as unknown as VariableDef[],
          wizardSchema: estampoBase.wizardSchema as unknown as WizardQuestion[],
          hasCustomTemplate,
          estampoCustom, // Keep for buildInitialVariables
        }
      })
    )

    // Build initialVariables using the first estampo (or default)
    // Since all Búsqueda Negativa estampos share similar variables, this is fine
    const firstEstampo = estamposWithCustoms[0]
    let initialVariables: Record<string, string> = {}

    if (firstEstampo) {
      initialVariables = buildInitialVariables({
        diligencia: diligenciaWithRelations,
        rol: diligenciaWithRelations.rol,
        estampoBase: estamposBase.find(eb => eb.id === firstEstampo.id)!,
        estampoCustom: firstEstampo.estampoCustom,
        dbUser,
      })
    }

    // Format response
    const estampos = estamposWithCustoms.map(({ estampoCustom, ...rest }) => rest)

    return NextResponse.json({
      ok: true,
      data: {
        estampos,
        initialVariables,
      },
    })
  } catch (error) {
    console.error('Error en GET /estampos/wizard:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener estampos para el wizard' },
      { status: 500 }
    )
  }
}

