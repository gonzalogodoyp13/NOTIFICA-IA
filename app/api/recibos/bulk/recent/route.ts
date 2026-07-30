import type { NextRequest } from 'next/server'
import { withApiUser } from '@/lib/api/server'
import { NextResponse } from 'next/server'
import { recentReceiptBulkOperations } from '@/lib/recibos/bulk'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.recibos.bulk.recent', async user => {
  return NextResponse.json({ ok: true, data: await recentReceiptBulkOperations(user.officeId) })

  })
}
