import type { NextRequest } from 'next/server'
import { withApiUser } from '@/lib/api/server'
import { NextResponse } from 'next/server'

import { getReceiptTemplateOptions } from '@/lib/recibos/query'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.recibos.filter-options', async user => {
  return NextResponse.json({ ok: true, data: { estampoTemplates: await getReceiptTemplateOptions(user.officeId) } })

  })
}
