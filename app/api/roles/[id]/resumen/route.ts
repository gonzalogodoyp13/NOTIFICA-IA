import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'

import { loadRoleSummaryData } from '@/lib/roles/workspace'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(_req, 'get.roles.id.resumen', async user => {
  try {

    const data = await loadRoleSummaryData(params.id, user.officeId)

    if (!data) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    console.error(`[GET /api/roles/${params.id}/resumen] Error:`, error)
    return NextResponse.json(
      { ok: false, error: `Error al obtener el resumen del rol: ${error?.message || 'Error desconocido'}` },
      { status: 500 }
    )
  }

  })
}
