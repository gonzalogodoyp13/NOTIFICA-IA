import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'

import { loadRoleSummaryData } from '@/lib/roles/workspace'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return withApiUser(_req, 'get.roles.id', async user => {
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
    console.error('API operation failed')
    return NextResponse.json(
      { ok: false, error: 'No se pudo completar la operacion.' },
      { status: 500 }
    )
  }

  })
}
