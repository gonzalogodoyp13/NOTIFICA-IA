import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { buildWizardInitialVariables, loadWizardCatalog, loadWizardDiligenciaContext } from '@/lib/estampos/server'

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

    const context = await loadWizardDiligenciaContext({
      diligenciaId: params.id,
      officeId: user.officeId,
      userId: user.id,
    })

    if (!context || 'error' in context) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const { dbUser, diligencia } = context

    const searchParams = req.nextUrl.searchParams
    const categoria = searchParams.get('categoria') || 'BUSQUEDA_NEGATIVA'

    const estamposWithCustoms = await loadWizardCatalog({
      categoria,
      officeId: user.officeId,
    })

    const firstEstampo = estamposWithCustoms[0]
    let initialVariables: Record<string, string> = {}

    if (firstEstampo) {
      initialVariables = buildWizardInitialVariables({
        diligencia,
        rol: diligencia.rol,
        estampoBase: firstEstampo.estampoBase,
        estampoCustom: firstEstampo.estampoCustom,
        dbUser,
      })
    }

    const estampos = estamposWithCustoms.map(({ estampoBase, estampoCustom, ...rest }) => rest)

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
