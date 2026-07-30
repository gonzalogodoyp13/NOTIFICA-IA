import 'server-only'

import { Prisma, type ReportDeliveryBatch, type ReportDeliveryRecipient } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { createMailAdapter, sendWithRetries, type MailAdapter } from '@/lib/recibos/mailer'
import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { debugLog, toSafeErrorMessage } from '@/lib/debugLog'
import { chileDayBounds, previousChileDateString } from './chileTime'
import { generateDailyReport, getReportForDownload } from './dailyReport'
import {
  DAILY_REPORT_TYPE,
  buildAuditReportEmail,
  chooseAuditReportAttachment,
  deliveryStatusFromCounts,
  sanitizeDeliveryError,
} from './dailyDeliveryCore'

type DeliveryMode = 'scheduled' | 'manual'

type DeliveryUser = {
  id: string
  email: string
}
type OfficeDeliveryResult =
  | { status: 'sent' | 'partial' | 'failed' | 'pending'; officeId: number; reportId: string; batchId: string; sentCount: number; failedCount: number; intendedRecipientCount: number }
  | { status: 'no_activity'; officeId: number; periodDate: string }
  | { status: 'no_recipients'; officeId: number; periodDate: string; reportId: string }
  | { status: 'generation_failed'; officeId: number; periodDate: string; error: string }

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || ''
}

function reportDownloadPath(reportId: string) {
  const base = appBaseUrl().replace(/\/$/, '')
  return `${base}/ajustes/reportes?reportId=${encodeURIComponent(reportId)}`
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

async function sendFailureAlert(input: {
  adapter: MailAdapter
  subject: string
  text: string
}) {
  const to = process.env.AUDIT_FAILURE_EMAIL?.trim()
  if (!to) return
  try {
    await sendWithRetries(input.adapter, {
      to: [to],
      subject: input.subject,
      text: input.text,
      attachments: [],
    }, 3)
  } catch (error) {
    debugLog('[dailyDelivery] failure alert failed', { error: toSafeErrorMessage(error) })
  }
}

async function upsertBatch(input: {
  officeId: number
  reportId: string
  periodStart: Date
  periodEnd: Date
  periodDate: string
  timezone: string
  adapter: MailAdapter
  mode: DeliveryMode
  intendedRecipientCount: number
}) {
  const where = {
    officeId_reportType_periodStart_periodEnd: {
      officeId: input.officeId,
      reportType: DAILY_REPORT_TYPE,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
  }
  return prisma.reportDeliveryBatch.upsert({
    where,
    create: {
      officeId: input.officeId,
      reportId: input.reportId,
      reportType: DAILY_REPORT_TYPE,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      periodDate: input.periodDate,
      timezone: input.timezone,
      status: 'pending',
      provider: input.adapter.provider,
      fromAccount: input.adapter.fromAccount,
      intendedRecipientCount: input.intendedRecipientCount,
      mode: input.mode,
      startedAt: new Date(),
    },
    update: {
      reportId: input.reportId,
      provider: input.adapter.provider,
      fromAccount: input.adapter.fromAccount,
      intendedRecipientCount: input.intendedRecipientCount,
      status: 'pending',
      errorMessage: null,
      mode: input.mode,
      startedAt: new Date(),
      completedAt: null,
    },
  })
}

async function ensureRecipients(batch: ReportDeliveryBatch, users: DeliveryUser[]) {
  const recipients: ReportDeliveryRecipient[] = []
  for (const user of users) {
    try {
      recipients.push(await prisma.reportDeliveryRecipient.create({
        data: {
          batchId: batch.id,
          userId: user.id,
          email: user.email,
          status: 'prepared',
        },
      }))
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error
      recipients.push(await prisma.reportDeliveryRecipient.update({
        where: { batchId_userId: { batchId: batch.id, userId: user.id } },
        data: { email: user.email },
      }))
    }
  }
  return recipients
}

async function refreshBatch(batchId: string) {
  const [sentCount, failedCount, skippedCount, pendingCount, batch] = await Promise.all([
    prisma.reportDeliveryRecipient.count({ where: { batchId, status: 'sent' } }),
    prisma.reportDeliveryRecipient.count({ where: { batchId, status: 'failed' } }),
    prisma.reportDeliveryRecipient.count({ where: { batchId, status: 'skipped' } }),
    prisma.reportDeliveryRecipient.count({ where: { batchId, status: { in: ['prepared', 'sending'] } } }),
    prisma.reportDeliveryBatch.findUniqueOrThrow({ where: { id: batchId } }),
  ])
  const status = deliveryStatusFromCounts({
    intended: batch.intendedRecipientCount,
    sent: sentCount,
    failed: failedCount,
    pending: pendingCount,
  })
  return prisma.reportDeliveryBatch.update({
    where: { id: batchId },
    data: {
      status,
      sentCount,
      failedCount,
      skippedCount,
      completedAt: pendingCount === 0 ? new Date() : null,
    },
  })
}

export async function sendDailyReportForOffice(input: {
  officeId: number
  periodDate?: string
  mode: DeliveryMode
  userId?: string | null
  requestId?: string
  adapter?: MailAdapter
}): Promise<OfficeDeliveryResult> {
  const periodDate = input.periodDate ?? previousChileDateString()
  const adapter = input.adapter ?? createMailAdapter()
  const bounds = chileDayBounds(periodDate)

  let reportResult: Awaited<ReturnType<typeof generateDailyReport>>
  try {
    reportResult = await generateDailyReport({
      officeId: input.officeId,
      userId: input.userId ?? null,
      date: periodDate,
      generationMode: input.mode === 'scheduled' ? 'scheduled' : 'manual_email',
    })
  } catch (error) {
    const message = sanitizeDeliveryError(error)
    await sendFailureAlert({
      adapter,
      subject: `Fallo al generar auditoria diaria - oficina ${input.officeId} - ${periodDate}`,
      text: [
        'No se pudo generar el reporte de auditoria diaria.',
        `Oficina: ${input.officeId}`,
        `Fecha reportada: ${periodDate}`,
        `Error: ${message}`,
      ].join('\n'),
    })
    return { status: 'generation_failed', officeId: input.officeId, periodDate, error: message }
  }

  if (reportResult.status === 'no_activity') {
    return { status: 'no_activity', officeId: input.officeId, periodDate }
  }

  const report = reportResult.report
  const [office, users, downloaded] = await Promise.all([
    prisma.office.findUnique({ where: { id: input.officeId }, select: { nombre: true } }),
    prisma.user.findMany({
      where: { officeId: input.officeId, isActive: true },
      orderBy: { email: 'asc' },
      select: { id: true, email: true },
    }),
    getReportForDownload(input.officeId, report.id),
  ])

  if (!downloaded) {
    const message = 'El reporte generado no esta disponible para descarga.'
    await sendFailureAlert({
      adapter,
      subject: `Fallo al preparar auditoria diaria - oficina ${input.officeId} - ${periodDate}`,
      text: `No se pudo descargar el reporte ${report.id} para enviar correos. Error: ${message}`,
    })
    return { status: 'generation_failed', officeId: input.officeId, periodDate, error: message }
  }

  if (!users.length) {
    return { status: 'no_recipients', officeId: input.officeId, periodDate, reportId: report.id }
  }

  const batch = await upsertBatch({
    officeId: input.officeId,
    reportId: report.id,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    periodDate,
    timezone: bounds.timezone,
    adapter,
    mode: input.mode,
    intendedRecipientCount: users.length,
  })
  const recipients = await ensureRecipients(batch, users)
  const email = buildAuditReportEmail({
    officeName: office?.nombre ?? `Oficina ${input.officeId}`,
    periodDate,
    activityCount: report.activityCount,
    downloadPath: reportDownloadPath(report.id),
  })
  const attachment = chooseAuditReportAttachment({
    buffer: downloaded.buffer,
    fileName: report.fileName,
    modifiedAt: report.generatedAt,
  })

  for (const recipient of recipients) {
    if (recipient.status === 'sent') continue

    await prisma.reportDeliveryRecipient.update({
      where: { id: recipient.id },
      data: { status: 'sending', errorMessage: null },
    })

    try {
      const result = await sendWithRetries(adapter, {
        to: [recipient.email],
        subject: email.subject,
        text: email.text,
        attachments: [{
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        }],
      }, 3)
      const now = new Date()
      await prisma.reportDeliveryRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'sent',
          attemptCount: recipient.attemptCount + result.attempts,
          providerMessageId: result.messageId,
          providerThreadId: result.threadId ?? null,
          providerInternetMessageId: result.internetMessageId ?? null,
          attachmentFilename: attachment.filename,
          attachmentMimeType: attachment.contentType,
          attachmentByteSize: attachment.content.byteLength,
          attachmentSha256: attachment.checksumSha256,
          sentAt: now,
          completedAt: now,
        },
      })
    } catch (error) {
      const message = sanitizeDeliveryError(error)
      await prisma.reportDeliveryRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'failed',
          attemptCount: recipient.attemptCount + 3,
          errorMessage: message,
          completedAt: new Date(),
        },
      })
      await sendFailureAlert({
        adapter,
        subject: `Fallo al enviar auditoria diaria - ${periodDate}`,
        text: [
          'No se pudo enviar el reporte de auditoria diaria a un destinatario despues de los reintentos.',
          `Oficina: ${input.officeId}`,
          `Fecha reportada: ${periodDate}`,
          `Destinatario: ${recipient.email}`,
          `Reporte: ${report.id}`,
          `Error: ${message}`,
        ].join('\n'),
      })
    }
  }

  const refreshed = await refreshBatch(batch.id)
  const status = refreshed.status === 'sent' || refreshed.status === 'partial' || refreshed.status === 'failed'
    ? refreshed.status
    : 'pending'
  await prisma.$transaction(async tx => {
    await tx.reportDeliveryBatch.update({ where: { id: batch.id }, data: { completedAt: refreshed.completedAt } })
    await enqueueExternalEvent(tx, {
      id: input.userId ?? undefined, officeId: input.officeId, requestId: input.requestId,
      actorType: input.userId ? 'USER' : 'SYSTEM', source: input.userId ? 'WEB' : 'SYSTEM',
    }, {
      eventType: 'report.daily.sent', module: 'reports', result: status === 'failed' ? 'failure' : 'success',
      recordType: 'ReportDeliveryBatch', recordId: batch.id, description: 'Envio de reporte diario registrado.',
      deduplicationKey: `report-delivery:${batch.id}:completed`,
      metadata: { reportId: report.id, batchId: batch.id, status, sentCount: refreshed.sentCount, failedCount: refreshed.failedCount, recipientCount: refreshed.intendedRecipientCount },
    })
  })
  await processActivityOutbox(50).catch(() => undefined)
  return {
    status,
    officeId: input.officeId,
    reportId: report.id,
    batchId: batch.id,
    sentCount: refreshed.sentCount,
    failedCount: refreshed.failedCount,
    intendedRecipientCount: refreshed.intendedRecipientCount,
  }
}

export async function sendDailyReportsForAllOffices(input: {
  periodDate?: string
  officeId?: number
  mode?: DeliveryMode
  adapter?: MailAdapter
  requestId?: string
}) {
  const periodDate = input.periodDate ?? previousChileDateString()
  const offices = input.officeId
    ? [{ id: input.officeId }]
    : await prisma.office.findMany({
      where: { users: { some: { isActive: true } } },
      orderBy: { id: 'asc' },
      select: { id: true },
    })

  const results: OfficeDeliveryResult[] = []
  for (const office of offices) {
    results.push(await sendDailyReportForOffice({
      officeId: office.id,
      periodDate,
      mode: input.mode ?? 'scheduled',
      adapter: input.adapter,
      requestId: input.requestId,
    }))
  }

  return {
    periodDate,
    officeCount: offices.length,
    results,
  }
}
