import { NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { getReceiptTemplateOptions } from '@/lib/recibos/query'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUserWithOffice()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ ok: true, data: { estampoTemplates: await getReceiptTemplateOptions(user.officeId) } })
}
