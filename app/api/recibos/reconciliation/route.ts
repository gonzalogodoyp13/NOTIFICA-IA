import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { parseReceiptFilters } from '@/lib/recibos/query'
import { getReconciliation, type ReconciliationCategory, type ReconciliationGroupBy } from '@/lib/recibos/reconciliation'

const categories = new Set(['RECONCILED','BOLETA_PENDING_PAYMENT','PAID_WITHOUT_BOLETA','WITHOUT_BOLETA_UNPAID'])
const groups = new Set(['category','bank','procurador','executionMonth','boleta'])

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice(); if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    const filters = parseReceiptFilters(req.nextUrl.searchParams)
    const selectedCategories = req.nextUrl.searchParams.getAll('category').filter(value => categories.has(value)) as ReconciliationCategory[]
    const rawGroup = req.nextUrl.searchParams.get('groupBy') ?? 'category'; const groupBy = (groups.has(rawGroup) ? rawGroup : 'category') as ReconciliationGroupBy
    return NextResponse.json({ ok: true, data: await getReconciliation({ officeId: user.officeId, filters, categories: selectedCategories, groupBy, page: filters.page, pageSize: filters.pageSize }) })
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error al conciliar recibos' }, { status: 400 }) }
}
