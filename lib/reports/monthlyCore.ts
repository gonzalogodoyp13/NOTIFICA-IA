import { deriveNotificationWorkflowState } from '../workflow/notificationStatus'

export const MONTHLY_REPORT_TYPE = 'monthly'

export type MonthlyFinancialClass = 'por_cobrar' | 'boletado_pendiente' | 'pagado'

export const MONTHLY_FINANCIAL_LABELS: Record<MonthlyFinancialClass, string> = {
  por_cobrar: 'Por cobrar',
  boletado_pendiente: 'Boletado pendiente de pago',
  pagado: 'Pagado',
}

export type MonthlyReceiptCandidate = {
  reciboId: string
  notificacionId: string | null
  documentoId: string | null
  documentVersionDeletedAt?: Date | string | null
  createdAt: Date
  fechaEjecucion: Date | null
  monto: number
}

export type MonthlyWorkflowDocument = {
  id?: string | null
  tipo?: string | null
  pdfId?: string | null
  currentVersionId?: string | null
  currentVersion?: { deletedAt?: Date | string | null } | null
  voidedAt?: Date | string | null
  createdAt?: Date | string | null
}

export type MonthlyNotificationCandidate = {
  id: string
  voidedAt?: Date | string | null
  documents: MonthlyWorkflowDocument[]
}

export type MonthlyQualifiedSource = {
  receipt: MonthlyReceiptCandidate
  notification: MonthlyNotificationCandidate | null
}

export type MonthlyQualifiedRow = {
  receiptId: string
  notificationId: string
  financialClass: MonthlyFinancialClass
  reconciliationWarnings: string[]
  amount: number
}

export type MonthlyExclusionRow = {
  receiptId: string
  notificationId: string
  reason: string
}

export type MonthlyFinancialSummary = {
  qualifiedCount: number
  totalAmount: number
  porCobrar: { count: number; amount: number }
  boletadoPendiente: { count: number; amount: number }
  pagado: { count: number; amount: number }
}

export function classifyMonthlyFinancialState(input: { estadoCobro: string | null | undefined; numeroBoleta: string | null | undefined }) {
  const isPaid = input.estadoCobro === 'PAGADO'
  const hasBoleta = !!input.numeroBoleta?.trim()
  const reconciliationWarnings = isPaid && !hasBoleta ? ['pagado_sin_boleta'] : []
  const financialClass: MonthlyFinancialClass = isPaid ? 'pagado' : hasBoleta ? 'boletado_pendiente' : 'por_cobrar'
  return { financialClass, reconciliationWarnings }
}

export function latestReceiptPerNotification<T extends MonthlyReceiptCandidate>(receipts: T[]) {
  const chosen = new Map<string, T>()
  for (const receipt of [...receipts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (!receipt.notificacionId || chosen.has(receipt.notificacionId)) continue
    chosen.set(receipt.notificacionId, receipt)
  }
  return chosen
}

function hasDeletedLinkedVersion(receipt: MonthlyReceiptCandidate) {
  return !!receipt.documentVersionDeletedAt
}

function hasValidLinkedReceiptDocument(receipt: MonthlyReceiptCandidate, notification: MonthlyNotificationCandidate) {
  const state = deriveNotificationWorkflowState(notification.documents)
  if (state.workflowStatus !== 'ejecutada') return false
  if (!receipt.documentoId) return true
  return notification.documents.some(document => {
    const hasActiveStoredVersion = !!document.currentVersionId && !document.currentVersion?.deletedAt
    return document.id === receipt.documentoId && document.tipo === 'Recibo' && !document.voidedAt && (!!document.pdfId || hasActiveStoredVersion)
  })
}

export function qualifyMonthlySources<T extends MonthlyQualifiedSource & {
  estadoCobro?: string | null
  numeroBoleta?: string | null
}>(sources: T[]) {
  const qualified: MonthlyQualifiedRow[] = []
  const exclusions: MonthlyExclusionRow[] = []
  const latestByNotification = latestReceiptPerNotification(sources
    .map(source => source.receipt)
    .filter(receipt => !!receipt.notificacionId && !!receipt.fechaEjecucion && receipt.monto > 0 && !hasDeletedLinkedVersion(receipt)))

  for (const source of sources) {
    const receipt = source.receipt
    const notificationId = receipt.notificacionId
    const exclude = (reason: string) => exclusions.push({ receiptId: receipt.reciboId, notificationId: notificationId ?? '', reason })

    if (!notificationId) {
      exclude('Sin notificacion vinculada')
      continue
    }
    const latestValidReceipt = latestByNotification.get(notificationId)
    if (latestValidReceipt && latestValidReceipt.reciboId !== receipt.reciboId) {
      exclude('Recibo anterior reemplazado por el ultimo recibo valido de la notificacion')
      continue
    }
    if (!receipt.fechaEjecucion) {
      exclude('Sin fecha de ejecucion')
      continue
    }
    if (receipt.monto <= 0) {
      exclude('Monto no positivo')
      continue
    }
    if (hasDeletedLinkedVersion(receipt)) {
      exclude('Version documental eliminada')
      continue
    }
    if (!source.notification) {
      exclude('Notificacion no encontrada')
      continue
    }
    if (source.notification.voidedAt) {
      exclude('Notificacion anulada')
      continue
    }
    if (!hasValidLinkedReceiptDocument(receipt, source.notification)) {
      exclude('Flujo incompleto o documentos Recibo/Estampo invalidos')
      continue
    }

    const classification = classifyMonthlyFinancialState({
      estadoCobro: source.estadoCobro,
      numeroBoleta: source.numeroBoleta,
    })
    qualified.push({
      receiptId: receipt.reciboId,
      notificationId,
      financialClass: classification.financialClass,
      reconciliationWarnings: classification.reconciliationWarnings,
      amount: Math.round(receipt.monto),
    })
  }

  return { qualified, exclusions }
}

export function summarizeMonthlyAmounts(rows: Array<{ financialClass: MonthlyFinancialClass; amount: number }>) {
  const summary = new Map<MonthlyFinancialClass, { count: number; amount: number }>()
  for (const key of Object.keys(MONTHLY_FINANCIAL_LABELS) as MonthlyFinancialClass[]) {
    summary.set(key, { count: 0, amount: 0 })
  }
  for (const row of rows) {
    const current = summary.get(row.financialClass) ?? { count: 0, amount: 0 }
    current.count += 1
    current.amount += row.amount
    summary.set(row.financialClass, current)
  }
  return summary
}

export function monthlyFinancialSummary(rows: Array<{ financialClass: MonthlyFinancialClass; amount: number }>): MonthlyFinancialSummary {
  const summary = summarizeMonthlyAmounts(rows)
  const porCobrar = summary.get('por_cobrar') ?? { count: 0, amount: 0 }
  const boletadoPendiente = summary.get('boletado_pendiente') ?? { count: 0, amount: 0 }
  const pagado = summary.get('pagado') ?? { count: 0, amount: 0 }
  return {
    qualifiedCount: rows.length,
    totalAmount: porCobrar.amount + boletadoPendiente.amount + pagado.amount,
    porCobrar,
    boletadoPendiente,
    pagado,
  }
}

export function formatChilePesoAmount(value: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

export function buildMonthlyReportEmail(input: {
  officeName: string
  periodDate: string
  qualifiedCount: number
  financialSummary: MonthlyFinancialSummary
  downloadPath: string
}) {
  const subject = `Reporte mensual NOTIFICA IA - ${input.officeName} - ${input.periodDate}`
  const text = [
    `Adjuntamos el reporte mensual de NOTIFICA IA para ${input.officeName}.`,
    '',
    `Periodo reportado: ${input.periodDate}`,
    `Notificaciones calificadas: ${input.qualifiedCount}`,
    `Total del periodo: ${formatChilePesoAmount(input.financialSummary.totalAmount)}`,
    `Por cobrar: ${input.financialSummary.porCobrar.count} (${formatChilePesoAmount(input.financialSummary.porCobrar.amount)})`,
    `Boletado pendiente de pago: ${input.financialSummary.boletadoPendiente.count} (${formatChilePesoAmount(input.financialSummary.boletadoPendiente.amount)})`,
    `Pagado: ${input.financialSummary.pagado.count} (${formatChilePesoAmount(input.financialSummary.pagado.amount)})`,
    '',
    'El archivo mensual va adjunto a este correo.',
    `Tambien puedes descargar este reporte desde el historial de reportes de tu oficina: ${input.downloadPath}`,
    '',
    'Este correo fue generado automaticamente. No respondas a este mensaje.',
  ].join('\n')
  return { subject, text }
}
