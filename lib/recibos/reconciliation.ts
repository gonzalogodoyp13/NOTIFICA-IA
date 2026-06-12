import 'server-only'

import type { ReceiptFiltersInput } from '@/lib/validations/recibos'
import { getReceiptList, type ReceiptListRow } from '@/lib/recibos/query'
import { canonicalizeReceiptRows, classifyReconciliation, reconciliationCategoryLabels as categoryLabels, reconciliationGroupIdentity, type ReconciliationCategory, type ReconciliationGroupBy } from '@/lib/recibos/reconciliation-core'
export type { ReconciliationCategory, ReconciliationGroupBy } from '@/lib/recibos/reconciliation-core'

export type ReconciliationRow = ReceiptListRow & { category: ReconciliationCategory; categoryLabel: string }
export type ReconciliationGroup = { key: string; label: string; count: number; totalAmount: number; rows: ReconciliationRow[] }

export function groupReconciliationRows(rows: ReconciliationRow[], groupBy: ReconciliationGroupBy) {
  const groups = new Map<string, ReconciliationGroup>()
  for (const row of rows) {
    const identity = reconciliationGroupIdentity(row, groupBy)
    const group = groups.get(identity.key) ?? { ...identity, count: 0, totalAmount: 0, rows: [] }
    group.count += 1; group.totalAmount += row.valor; group.rows.push(row); groups.set(identity.key, group)
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
}

export async function getReconciliation(params: {
  officeId: number
  filters: ReceiptFiltersInput
  categories?: ReconciliationCategory[]
  groupBy?: ReconciliationGroupBy
  page?: number
  pageSize?: number
  exportAll?: boolean
}) {
  const list = await getReceiptList(params.officeId, params.filters, { exportAll: true })
  const canonical = canonicalizeReceiptRows(list.rows).map<ReconciliationRow>(row => {
    const category = classifyReconciliation(row)
    return { ...row, category, categoryLabel: categoryLabels[category] }
  })
  const filtered = params.categories?.length ? canonical.filter(row => params.categories!.includes(row.category)) : canonical
  const counts = (category: ReconciliationCategory) => filtered.filter(row => row.category === category).length
  const total = filtered.length
  const pageSize = params.exportAll ? Math.max(total, 1) : Math.min(Math.max(params.pageSize ?? 25, 1), 100)
  const page = params.exportAll ? 1 : Math.max(params.page ?? 1, 1)
  const pageRows = params.exportAll ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize)
  return {
    rows: pageRows,
    groups: groupReconciliationRows(pageRows, params.groupBy ?? 'category'),
    kpis: {
      total,
      reconciled: counts('RECONCILED'),
      reconciliationPercentage: total ? Math.round((counts('RECONCILED') / total) * 1000) / 10 : 0,
      missingBoleta: counts('PAID_WITHOUT_BOLETA') + counts('WITHOUT_BOLETA_UNPAID'),
      pendingPayment: counts('BOLETA_PENDING_PAYMENT'),
      paidWithoutBoleta: counts('PAID_WITHOUT_BOLETA'),
      totalAmount: filtered.reduce((sum, row) => sum + row.valor, 0),
    },
    pagination: { page, pageSize, totalRows: total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  }
}
