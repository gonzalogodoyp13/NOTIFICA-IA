import { describe, expect, it } from 'vitest'

import {
  aggregateDeliveryStatus,
  buildAuditReportEmail,
  chooseAuditReportAttachment,
  deliveryStatusFromCounts,
  sanitizeDeliveryError,
  XLSX_ATTACHMENT_MIME_TYPE,
  ZIP_MIME_TYPE,
} from '../../lib/reports/dailyDeliveryCore'

describe('daily report delivery core', () => {
  it('derives aggregate delivery statuses', () => {
    expect(deliveryStatusFromCounts({ intended: 0, sent: 0, failed: 0, pending: 0 })).toBe('not_sent')
    expect(deliveryStatusFromCounts({ intended: 2, sent: 2, failed: 0, pending: 0 })).toBe('sent')
    expect(deliveryStatusFromCounts({ intended: 2, sent: 1, failed: 1, pending: 0 })).toBe('partial')
    expect(deliveryStatusFromCounts({ intended: 2, sent: 0, failed: 2, pending: 0 })).toBe('failed')
    expect(deliveryStatusFromCounts({ intended: 2, sent: 0, failed: 0, pending: 2 })).toBe('pending')
  })

  it('uses the newest batch for report history status', () => {
    expect(aggregateDeliveryStatus([])).toBe('not_sent')
    expect(aggregateDeliveryStatus([{
      intendedRecipientCount: 2,
      sentCount: 1,
      failedCount: 0,
      recipients: [{ status: 'sent' }, { status: 'prepared' }],
    }])).toBe('partial')
  })

  it('keeps small reports as xlsx attachments', () => {
    const attachment = chooseAuditReportAttachment({
      buffer: Buffer.from('small workbook'),
      fileName: 'auditoria-diaria-2026-06-23.xlsx',
      thresholdBytes: 1024,
    })

    expect(attachment.filename).toBe('auditoria-diaria-2026-06-23.xlsx')
    expect(attachment.contentType).toBe(XLSX_ATTACHMENT_MIME_TYPE)
    expect(attachment.content.toString()).toBe('small workbook')
  })

  it('zips reports above the threshold', () => {
    const attachment = chooseAuditReportAttachment({
      buffer: Buffer.from('large workbook'),
      fileName: 'auditoria-diaria-2026-06-23.xlsx',
      thresholdBytes: 1,
      modifiedAt: new Date('2026-06-24T12:00:00Z'),
    })

    expect(attachment.filename).toBe('auditoria-diaria-2026-06-23.zip')
    expect(attachment.contentType).toBe(ZIP_MIME_TYPE)
    expect(attachment.content.subarray(0, 4).toString('hex')).toBe('504b0304')
    expect(attachment.content.includes(Buffer.from('auditoria-diaria-2026-06-23.xlsx'))).toBe(true)
  })

  it('builds Spanish email content without workbook data', () => {
    const email = buildAuditReportEmail({
      officeName: 'Oficina Centro',
      periodDate: '2026-06-23',
      activityCount: 7,
      downloadPath: '/ajustes/reportes?reportId=abc',
    })

    expect(email.subject).toBe('Auditoria diaria NOTIFICA IA - Oficina Centro - 2026-06-23')
    expect(email.text).toContain('Actividad registrada: 7')
    expect(email.text).toContain('/ajustes/reportes?reportId=abc')
  })

  it('sanitizes long delivery errors', () => {
    const error = sanitizeDeliveryError(new Error(`fallo\n${'x'.repeat(700)}`))
    expect(error).not.toContain('\n')
    expect(error.length).toBeLessThanOrEqual(500)
  })
})
