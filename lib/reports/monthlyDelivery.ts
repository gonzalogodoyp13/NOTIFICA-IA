import 'server-only'

import { Prisma, type ReportDeliveryBatch, type ReportDeliveryRecipient } from '@prisma/client'

import { debugLog, toSafeErrorMessage } from '@/lib/debugLog'
import { prismaNoMiddleware } from '@/lib/prismaNoMiddleware'
import { createMailAdapter, sendWithRetries, type MailAdapter } from '@/lib/recibos/mailer'
import { asJsonObject } from '@/lib/utils/json'
import { chileMonthBounds, previousChileMonthString } from './chileTime'
import { chooseAuditReportAttachment, deliveryStatusFromCounts, sanitizeDeliveryError } from './dailyDeliveryCore'
import { getReportForDownload } from './dailyReport'
import { buildMonthlyReportEmail, MONTHLY_REPORT_TYPE, type MonthlyFinancialSummary } from './monthlyCore'
import { generateMonthlyReport, getMonthlyReportFinancialSummary } from './monthlyReport'

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
    debugLog('[monthlyDelivery] failure alert failed', { error: toSafeErrorMessage(error) })
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
  return prismaNoMiddleware.reportDeliveryBatch.upsert({
    where: {
      officeId_reportType_periodStart_periodEnd: {
        officeId: input.officeId,
        reportType: MONTHLY_REPORT_TYPE,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    },
    create: {
      officeId: input.officeId,
      reportId: input.reportId,
      reportType: MONTHLY_REPORT_TYPE,
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
      recipients.push(await prismaNoMiddleware.reportDeliveryRecipient.create({
        data: {
          batchId: batch.id,
          userId: user.id,
          email: user.email,
          status: 'prepared',
        },
      }))
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error
      recipients.push(await prismaNoMiddleware.reportDeliveryRecipient.update({
        where: { batchId_userId: { batchId: batch.id, userId: user.id } },
        data: { email: user.email },
      }))
    }
  }
  return recipients
}

async function refreshBatch(batchId: string) {
  const [sentCount, failedCount, skippedCount, pendingCount, batch] = await Promise.all([
    prismaNoMiddleware.reportDeliveryRecipient.count({ where: { batchId, status: 'sent' } }),
    prismaNoMiddleware.reportDeliveryRecipient.count({ where: { batchId, status: 'failed' } }),
    prismaNoMiddleware.reportDeliveryRecipient.count({ where: { batchId, status: 'skipped' } }),
    prismaNoMiddleware.reportDeliveryRecipient.count({ where: { batchId, status: { in: ['prepared', 'sending'] } } }),
    prismaNoMiddleware.reportDeliveryBatch.findUniqueOrThrow({ where: { id: batchId } }),
  ])
  const status = deliveryStatusFromCounts({
    intended: batch.intendedRecipientCount,
    sent: sentCount,
    failed: failedCount,
    pending: pendingCount,
  })
  return prismaNoMiddleware.reportDeliveryBatch.update({
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

function financialSummaryFromMetadata(value: unknown): MonthlyFinancialSummary | null {
  const metadata = asJsonObject(value)
  const summary = asJsonObject(metadata?.financialSummary)
  const parseBucket = (bucket: unknown) => {
    const object = asJsonObject(bucket)
    const count = Number(object?.count)
    const amount = Number(object?.amount)
    return {
      count: Number.isFinite(count) ? count : 0,
      amount: Number.isFinite(amount) ? amount : 0,
    }
  }
  if (!summary) return null
  const totalAmount = Number(summary.totalAmount)
  const qualifiedCount = Number(summary.qualifiedCount)
  return {
    qualifiedCount: Number.isFinite(qualifiedCount) ? qualifiedCount : 0,
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
    porCobrar: parseBucket(summary.porCobrar),
    boletadoPendiente: parseBucket(summary.boletadoPendiente),
    pagado: parseBucket(summary.pagado),
  }
}

export async function sendMonthlyReportForOffice(input: {
  officeId: number
  periodDate?: string
  mode: DeliveryMode
  userId?: string | null
  adapter?: MailAdapter
}): Promise<OfficeDeliveryResult> {
  const periodDate = input.periodDate ?? previousChileMonthString()
  const adapter = input.adapter ?? createMailAdapter()
  const bounds = chileMonthBounds(periodDate)

  let reportResult: Awaited<ReturnType<typeof generateMonthlyReport>>
  try {
    reportResult = await generateMonthlyReport({
      officeId: input.officeId,
      userId: input.userId ?? null,
      month: periodDate,
      force: false,
    })
  } catch (error) {
    const message = sanitizeDeliveryError(error)
    await sendFailureAlert({
      adapter,
      subject: `Fallo al generar reporte mensual - oficina ${input.officeId} - ${periodDate}`,
      text: [
        'No se pudo generar el reporte mensual.',
        `Oficina: ${input.officeId}`,
        `Periodo reportado: ${periodDate}`,
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
    prismaNoMiddleware.office.findUnique({ where: { id: input.officeId }, select: { nombre: true } }),
    prismaNoMiddleware.user.findMany({
      where: { officeId: input.officeId, isActive: true },
      orderBy: { email: 'asc' },
      select: { id: true, email: true },
    }),
    getReportForDownload(input.officeId, report.id),
  ])

  if (!downloaded) {
    const message = 'El reporte mensual generado no esta disponible para descarga.'
    await sendFailureAlert({
      adapter,
      subject: `Fallo al preparar reporte mensual - oficina ${input.officeId} - ${periodDate}`,
      text: `No se pudo descargar el reporte mensual ${report.id} para enviar correos. Error: ${message}`,
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
  const financialSummary = financialSummaryFromMetadata(report.metadata)
    ?? await getMonthlyReportFinancialSummary({ officeId: input.officeId, month: periodDate })
  const email = buildMonthlyReportEmail({
    officeName: office?.nombre ?? `Oficina ${input.officeId}`,
    periodDate,
    qualifiedCount: report.activityCount,
    financialSummary,
    downloadPath: reportDownloadPath(report.id),
  })
  const attachment = chooseAuditReportAttachment({
    buffer: downloaded.buffer,
    fileName: report.fileName,
    modifiedAt: report.generatedAt,
  })

  for (const recipient of recipients) {
    if (recipient.status === 'sent') continue

    await prismaNoMiddleware.reportDeliveryRecipient.update({
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
      await prismaNoMiddleware.reportDeliveryRecipient.update({
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
      await prismaNoMiddleware.reportDeliveryRecipient.update({
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
        subject: `Fallo al enviar reporte mensual - ${periodDate}`,
        text: [
          'No se pudo enviar el reporte mensual a un destinatario despues de los reintentos.',
          `Oficina: ${input.officeId}`,
          `Periodo reportado: ${periodDate}`,
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

export async function sendMonthlyReportsForAllOffices(input: {
  periodDate?: string
  officeId?: number
  mode?: DeliveryMode
  adapter?: MailAdapter
}) {
  const periodDate = input.periodDate ?? previousChileMonthString()
  const offices = input.officeId
    ? [{ id: input.officeId }]
    : await prismaNoMiddleware.office.findMany({
      where: { users: { some: { isActive: true } } },
      orderBy: { id: 'asc' },
      select: { id: true },
    })

  const results: OfficeDeliveryResult[] = []
  for (const office of offices) {
    results.push(await sendMonthlyReportForOffice({
      officeId: office.id,
      periodDate,
      mode: input.mode ?? 'scheduled',
      adapter: input.adapter,
    }))
  }

  return {
    periodDate,
    officeCount: offices.length,
    results,
  }
}
