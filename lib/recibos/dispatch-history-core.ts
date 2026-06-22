import { createHash } from 'crypto'

export type DispatchBatchStatus = 'prepared' | 'sending' | 'sent' | 'failed' | 'partial'
export type DispatchRecipientStatus = 'prepared' | 'sending' | 'sent' | 'failed' | 'skipped'

const STATUS_LABELS: Record<DispatchBatchStatus | DispatchRecipientStatus, string> = {
  prepared: 'Preparado',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Fallido',
  partial: 'Parcial',
  skipped: 'Omitido',
}

export function dispatchStatusLabel(status: string) {
  return STATUS_LABELS[status as DispatchBatchStatus | DispatchRecipientStatus] ?? status
}

export function sanitizeDispatchError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'No se pudo enviar el correo.'
  return message
    .replace(/(password|secret|token|authorization|bearer)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 1000)
}

export function sha256Hex(bytes: Buffer | Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function finalBatchStatus(counts: { sent: number; failed: number }) {
  if (counts.failed > 0 && counts.sent > 0) return 'partial' satisfies DispatchBatchStatus
  if (counts.failed > 0) return 'failed' satisfies DispatchBatchStatus
  return 'sent' satisfies DispatchBatchStatus
}

export function replyState(replyCount: number) {
  return replyCount > 0 ? 'Con respuestas' : 'Sin respuestas'
}
