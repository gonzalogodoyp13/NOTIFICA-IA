import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'

import { getReceiptList, parseReceiptFilters } from '@/lib/recibos/query'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.recibos', async user => {
  try {

    const filters = parseReceiptFilters(req.nextUrl.searchParams)
    const result = await getReceiptList(user.officeId, filters)

    return NextResponse.json({
      ok: true,
      data: {
        rows: result.rows,
        summary: result.summary,
        pagination: result.pagination,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al obtener los recibos'

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 }
    )
  }

  })
}
