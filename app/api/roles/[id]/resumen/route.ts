import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { loadRoleSummaryData } from '@/lib/roles/workspace'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

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
}
