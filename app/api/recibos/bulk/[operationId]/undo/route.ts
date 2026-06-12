import { NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { undoReceiptBulkOperation } from '@/lib/recibos/bulk'

export async function POST(_: Request, { params }: { params: { operationId: string } }) {
  try {
    const user = await getCurrentUserWithOffice()
    if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    return NextResponse.json({ ok: true, data: await undoReceiptBulkOperation({ officeId: user.officeId, userId: user.id, operationId: params.operationId }) })
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'No se pudo deshacer la operacion' }, { status: 400 }) }
}
