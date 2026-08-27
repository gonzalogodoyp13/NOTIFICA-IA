import 'server-only'

import { prisma } from '@/lib/prisma'
import { createMailAdapter, type MailAdapter } from '@/lib/recibos/mailer'
import { chileDayBounds, previousChileDateString } from './chileTime'
import { generateDailyReport } from './dailyReport'
import { buildAuditReportEmail, DAILY_REPORT_TYPE, sanitizeDeliveryError } from './dailyDeliveryCore'
import {
  executeReportDelivery,
  scheduledReportIdempotencyKey,
  type DeliveryMode,
  type DeliveryTarget,
} from './deliveryAttempts'

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || ''
}

function reportDownloadPath(reportId: string) {
  return `${appBaseUrl().replace(/\/$/, '')}/ajustes/reportes?reportId=${encodeURIComponent(reportId)}`
}

export async function sendDailyReportForOffice(input: {
  officeId: number
  periodDate?: string
  mode: DeliveryMode
  target?: DeliveryTarget
  previousAttemptId?: string | null
  idempotencyKey?: string
  userId?: string | null
  requestId?: string
  adapter?: MailAdapter
  shouldCancel?: () => Promise<boolean>
  onProgress?: (completed: number, total: number, phase: string) => Promise<void>
}) {
  const periodDate = input.periodDate ?? previousChileDateString()
  const adapter = input.adapter ?? createMailAdapter()
  const bounds = chileDayBounds(periodDate)
  let generated: Awaited<ReturnType<typeof generateDailyReport>>
  try {
    generated = await generateDailyReport({
      officeId: input.officeId,
      userId: input.userId ?? null,
      date: periodDate,
      generationMode: input.mode === 'scheduled' ? 'scheduled' : 'manual_email',
      requestId: input.requestId,
    })
  } catch (error) {
    return { status: 'generation_failed' as const, officeId: input.officeId, periodDate, error: sanitizeDeliveryError(error) }
  }
  if (generated.status === 'no_activity') return { status: 'no_activity' as const, officeId: input.officeId, periodDate }

  const office = await prisma.office.findUnique({ where: { id: input.officeId }, select: { nombre: true } })
  const email = buildAuditReportEmail({
    officeName: office?.nombre ?? `Oficina ${input.officeId}`,
    periodDate,
    activityCount: generated.report.activityCount,
    downloadPath: reportDownloadPath(generated.report.id),
  })
  const result = await executeReportDelivery({
    officeId: input.officeId,
    userId: input.userId,
    requestId: input.requestId,
    mode: input.mode,
    target: input.target ?? 'all',
    previousAttemptId: input.previousAttemptId,
    idempotencyKey: input.idempotencyKey ?? scheduledReportIdempotencyKey({ officeId: input.officeId, reportType: DAILY_REPORT_TYPE, periodDate: bounds.isoDate }),
    report: generated.report,
    adapter,
    email,
    shouldCancel: input.shouldCancel,
    onProgress: input.onProgress,
  })
  return { ...result, officeId: input.officeId, periodDate }
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
      where: { users: { some: { isActive: true, isOfficeAdmin: true } } },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
  const results = []
  for (const office of offices) {
    results.push(await sendDailyReportForOffice({
      officeId: office.id,
      periodDate,
      mode: input.mode ?? 'scheduled',
      adapter: input.adapter,
      requestId: input.requestId,
    }))
  }
  return { periodDate, officeCount: offices.length, results }
}
