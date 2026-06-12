export type CoreReceiptRow = {
  reciboId: string
  createdAt?: string
  notificacionId: string | null
  documentoId: string | null
  estado: 'Pagado' | 'Sin pagar'
  numeroBoleta: string
  banco: string
  procurador: string
  fechaEjecucion: string | null
  valor: number
}

export type ReconciliationCategory = 'RECONCILED' | 'BOLETA_PENDING_PAYMENT' | 'PAID_WITHOUT_BOLETA' | 'WITHOUT_BOLETA_UNPAID'
export type ReconciliationGroupBy = 'category' | 'bank' | 'procurador' | 'executionMonth' | 'boleta'

export const reconciliationCategoryLabels: Record<ReconciliationCategory, string> = {
  RECONCILED: 'Conciliado', BOLETA_PENDING_PAYMENT: 'Boleta pendiente de pago',
  PAID_WITHOUT_BOLETA: 'Pagado sin boleta', WITHOUT_BOLETA_UNPAID: 'Sin boleta y sin pagar',
}

export function classifyReconciliation(row: CoreReceiptRow): ReconciliationCategory {
  const hasBoleta = !!row.numeroBoleta && row.numeroBoleta !== '-'
  if (row.estado === 'Pagado' && hasBoleta) return 'RECONCILED'
  if (row.estado === 'Sin pagar' && hasBoleta) return 'BOLETA_PENDING_PAYMENT'
  if (row.estado === 'Pagado') return 'PAID_WITHOUT_BOLETA'
  return 'WITHOUT_BOLETA_UNPAID'
}

export function canonicalizeReceiptRows<T extends CoreReceiptRow>(rows: T[]) {
  const seen = new Set<string>()
  return [...rows].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return bTime - aTime
  }).filter(row => {
    const key = row.notificacionId ? `notification:${row.notificacionId}` : row.documentoId ? `document:${row.documentoId}` : `receipt:${row.reciboId}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}

export function reconciliationGroupIdentity(row: CoreReceiptRow & { category: ReconciliationCategory; categoryLabel: string }, groupBy: ReconciliationGroupBy) {
  if (groupBy === 'category') return { key: row.category, label: row.categoryLabel }
  if (groupBy === 'bank') return { key: row.banco, label: row.banco }
  if (groupBy === 'procurador') return { key: row.procurador, label: row.procurador }
  if (groupBy === 'boleta') return { key: row.numeroBoleta, label: row.numeroBoleta }
  if (!row.fechaEjecucion) return { key: 'SIN_FECHA', label: 'Sin fecha de ejecucion' }
  const date = new Date(row.fechaEjecucion)
  return { key: date.toISOString().slice(0, 7), label: new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date) }
}
