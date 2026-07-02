import type { MailAttachment } from '@/lib/recibos/mailer'
import { createHash } from 'crypto'
import { buildSingleFileZip } from './zip'

export const DAILY_REPORT_TYPE = 'daily'
export const DEFAULT_AUDIT_ZIP_THRESHOLD_BYTES = 10 * 1024 * 1024
export const ZIP_MIME_TYPE = 'application/zip'
export const XLSX_ATTACHMENT_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type DeliveryStatus = 'not_sent' | 'pending' | 'sent' | 'partial' | 'failed'

export function auditZipThresholdBytes() {
  const raw = Number(process.env.AUDIT_REPORT_ZIP_THRESHOLD_BYTES)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AUDIT_ZIP_THRESHOLD_BYTES
}

export function deliveryStatusFromCounts(input: {
  intended: number
  sent: number
  failed: number
  pending: number
}) : DeliveryStatus {
  if (input.intended <= 0) return 'not_sent'
  if (input.sent === input.intended) return 'sent'
  if (input.sent > 0 && input.failed > 0) return 'partial'
  if (input.sent > 0 && input.pending > 0) return 'partial'
  if (input.failed === input.intended) return 'failed'
  return 'pending'
}

export function aggregateDeliveryStatus(batches: Array<{
  intendedRecipientCount: number
  sentCount: number
  failedCount: number
  recipients?: Array<{ status: string }>
}>): DeliveryStatus {
  if (!batches.length) return 'not_sent'
  const latest = batches[0]
  const pending = latest.recipients
    ? latest.recipients.filter(recipient => recipient.status === 'prepared' || recipient.status === 'sending').length
    : Math.max(0, latest.intendedRecipientCount - latest.sentCount - latest.failedCount)
  return deliveryStatusFromCounts({
    intended: latest.intendedRecipientCount,
    sent: latest.sentCount,
    failed: latest.failedCount,
    pending,
  })
}

export function buildAuditReportEmail(input: {
  officeName: string
  periodDate: string
  activityCount: number
  downloadPath: string
}) {
  const subject = `Auditoria diaria NOTIFICA IA - ${input.officeName} - ${input.periodDate}`
  const text = [
    `Adjuntamos el reporte de auditoria diaria de NOTIFICA IA para ${input.officeName}.`,
    '',
    `Fecha reportada: ${input.periodDate}`,
    `Actividad registrada: ${input.activityCount}`,
    '',
    `Tambien puedes descargar este reporte desde el historial de reportes de tu oficina: ${input.downloadPath}`,
    '',
    'Este correo fue generado automaticamente. No respondas a este mensaje.',
  ].join('\n')
  return { subject, text }
}

export function chooseAuditReportAttachment(input: {
  buffer: Buffer
  fileName: string
  thresholdBytes?: number
  modifiedAt?: Date
}): MailAttachment & { checksumSha256: string } {
  const threshold = input.thresholdBytes ?? auditZipThresholdBytes()
  if (input.buffer.length <= threshold) {
    return {
      filename: input.fileName,
      content: input.buffer,
      contentType: XLSX_ATTACHMENT_MIME_TYPE,
      checksumSha256: createHash('sha256').update(input.buffer).digest('hex'),
    }
  }

  const zipName = input.fileName.replace(/\.xlsx$/i, '.zip')
  const zip = buildSingleFileZip({
    filename: input.fileName,
    content: input.buffer,
    modifiedAt: input.modifiedAt,
  })

  return {
    filename: zipName,
    content: zip,
    contentType: ZIP_MIME_TYPE,
    checksumSha256: createHash('sha256').update(zip).digest('hex'),
  }
}

export function sanitizeDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, ' ').trim().slice(0, 500) || 'No se pudo enviar el correo.'
}
