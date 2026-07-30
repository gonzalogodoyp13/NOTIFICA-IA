import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { undoReceiptBulkOperation } from '@/lib/recibos/bulk'

export async function POST(_: NextRequest, { params }: { params: { operationId: string } }) {
  return withApiUser(_, 'post.recibos.bulk.operationId.undo', async user => {
  try {
    return NextResponse.json({ ok: true, data: await undoReceiptBulkOperation({ officeId: user.officeId, userId: user.id, operationId: params.operationId }) })
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'No se pudo deshacer la operacion' }, { status: 400 }) }

  })
}
