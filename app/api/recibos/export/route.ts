import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { getReceiptList, parseReceiptFilters } from '@/lib/recibos/query'
import { buildRecibosWorkbook } from '@/lib/recibos/xlsx'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const filters = parseReceiptFilters(req.nextUrl.searchParams)
    const result = await getReceiptList(user.officeId, filters, { exportAll: true })
    const workbook = buildRecibosWorkbook(result.rows, result.summary.totalValorShown)

    return new NextResponse(workbook, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="gestion-recibos.xlsx"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al exportar los recibos'

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 }
    )
  }
}
