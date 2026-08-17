import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'

import { buildWizardInitialVariables, loadWizardCatalog, loadWizardDiligenciaContext } from '@/lib/estampos/server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'get.diligencias.id.estampos.wizard', async user => {
  try {

    const searchParams = req.nextUrl.searchParams
    const notificacionId = searchParams.get('notificacionId')

    const context = await loadWizardDiligenciaContext({
      diligenciaId: params.id,
      officeId: user.officeId,
      userId: user.id,
      notificacionId,
    })

    if (!context || 'error' in context) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const { dbUser, diligencia, ejecutadoFromNotificacion, notificacionMeta, activeReceiptAmount } = context

    const categoria = searchParams.get('categoria') || 'BUSQUEDA_NEGATIVA'

    const estamposWithCustoms = await loadWizardCatalog({
      categoria,
      officeId: user.officeId,
      officeCacheRevision: user.officeCacheRevision,
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
        notificacionMeta,
        ejecutadoFromNotificacion,
        activeReceiptAmount,
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

  })
}
