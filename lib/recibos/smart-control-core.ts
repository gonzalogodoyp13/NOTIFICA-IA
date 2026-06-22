export type ReplyClassification = 'recibido' | 'observado' | 'requiere_correccion' | 'pago_informado' | 'otro'
export type OperationalState = 'sent' | 'failed' | 'waiting' | 'overdue' | 'replied' | 'resolved'

export const CLASSIFICATION_RULE_VERSION = 'rules-v1'
export const DUPLICATE_WINDOW_DAYS = 7
export const OVERDUE_BUSINESS_DAYS = 5

function normalizedText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function suggestReplyClassification(subject: string, body: string): ReplyClassification {
  const text = normalizedText(`${subject}\n${body}`)
  if (/\b(pago|pagado|transferencia|comprobante|deposito)\b/.test(text)) return 'pago_informado'
  if (/\b(corregir|correccion|corregido|error|incorrecto|falta|rectificar)\b/.test(text)) return 'requiere_correccion'
  if (/\b(observado|observacion|revisar|revision|no corresponde)\b/.test(text)) return 'observado'
  if (/\b(recibido|recepcionado|gracias|conforme|ok)\b/.test(text)) return 'recibido'
  return 'otro'
}

export function businessDaysBetween(from: Date, to: Date) {
  if (to <= from) return 0
  const current = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  let count = 0
  while (current < end) {
    current.setDate(current.getDate() + 1)
    const day = current.getDay()
    if (day !== 0 && day !== 6) count += 1
  }
  return count
}

export function deriveOperationalState(params: {
  status: string
  provider: string
  dispatchKind: string
  sentAt: Date | null
  replyCount: number
  resolvedAt: Date | null
  now?: Date
}): OperationalState {
  if (params.resolvedAt) return 'resolved'
  if (params.status === 'failed') return 'failed'
  if (params.replyCount > 0) return 'replied'
  if (params.status === 'sent' && params.provider !== 'dry-run' && params.dispatchKind !== 'test' && params.sentAt) {
    return businessDaysBetween(params.sentAt, params.now ?? new Date()) > OVERDUE_BUSINESS_DAYS ? 'overdue' : 'waiting'
  }
  return 'sent'
}

export function overlappingReciboIds(currentIds: string[], previousIds: string[]) {
  const previous = new Set(previousIds)
  return Array.from(new Set(currentIds.filter(id => previous.has(id))))
}

export function requiresResolutionNote(classification: string | null | undefined) {
  return classification === 'observado' || classification === 'requiere_correccion'
}

export function validReplyClassification(value: string): value is ReplyClassification {
  return ['recibido', 'observado', 'requiere_correccion', 'pago_informado', 'otro'].includes(value)
}

export function healthState(params: { enabled: boolean; configured: boolean; lastError?: string | null; lastHealthyAt?: Date | null }) {
  if (!params.enabled) return 'disabled'
  if (!params.configured) return 'misconfigured'
  if (params.lastError) return 'degraded'
  if (params.lastHealthyAt) return 'healthy'
  return 'unknown'
}
