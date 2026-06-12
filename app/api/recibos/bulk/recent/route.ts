import { NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { recentReceiptBulkOperations } from '@/lib/recibos/bulk'

export async function GET() {
  const user = await getCurrentUserWithOffice()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ ok: true, data: await recentReceiptBulkOperations(user.officeId) })
}
