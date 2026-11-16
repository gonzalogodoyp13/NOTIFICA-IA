import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { undoReceiptBulkOperation } from '@/lib/recibos/bulk'

export async function POST(_: NextRequest, props: { params: Promise<{ operationId: string }> }) {
  const params = await props.params;
  return withApiUser(_, 'post.recibos.bulk.operationId.undo', async user => {
  try {
    return NextResponse.json({ ok: true, data: await undoReceiptBulkOperation({ officeId: user.officeId, userId: user.id, operationId: params.operationId }) })
  } catch (error) { return NextResponse.json({ ok: false, error: 'No se pudo deshacer la operación' }, { status: 400 }) }

  })
}
