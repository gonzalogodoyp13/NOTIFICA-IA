import 'server-only'

import { prisma } from '@/lib/prisma'
import { createMailAdapter, type MailAdapter } from '@/lib/recibos/mailer'
import { asJsonObject } from '@/lib/utils/json'
import { previousChileMonthString } from './chileTime'
import { sanitizeDeliveryError } from './dailyDeliveryCore'
import {
  executeReportDelivery,
  scheduledReportIdempotencyKey,
  type DeliveryMode,
  type DeliveryTarget,
} from './deliveryAttempts'
import { buildMonthlyReportEmail, MONTHLY_REPORT_TYPE, type MonthlyFinancialSummary } from './monthlyCore'
import { generateMonthlyReport, getMonthlyReportFinancialSummary } from './monthlyReport'

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || ''
}

function reportDownloadPath(reportId: string) {
  return `${appBaseUrl().replace(/\/$/, '')}/ajustes/reportes?reportId=${encodeURIComponent(reportId)}`
}

function financialSummaryFromMetadata(value: unknown): MonthlyFinancialSummary | null {
  const metadata = asJsonObject(value)
  const summary = asJsonObject(metadata?.financialSummary)
  const parseBucket = (bucket: unknown) => {
    const object = asJsonObject(bucket)
    const count = Number(object?.count)
    const amount = Number(object?.amount)
    return { count: Number.isFinite(count) ? count : 0, amount: Number.isFinite(amount) ? amount : 0 }
  }
  if (!summary) return null
  const porCobrar = parseBucket(summary.porCobrar)
  const boletadoPendiente = parseBucket(summary.boletadoPendiente)
  const pagado = parseBucket(summary.pagado)
  return {
    qualifiedCount: Number.isFinite(Number(summary.qualifiedCount)) ? Number(summary.qualifiedCount) : porCobrar.count + boletadoPendiente.count + pagado.count,
    totalAmount: Number.isFinite(Number(summary.totalAmount)) ? Number(summary.totalAmount) : porCobrar.amount + boletadoPendiente.amount + pagado.amount,
    porCobrar,
    boletadoPendiente,
    pagado,
  }
}

export async function sendMonthlyReportForOffice(input: {
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
  const periodDate = input.periodDate ?? previousChileMonthString()
  const adapter = input.adapter ?? createMailAdapter()
  let generated: Awaited<ReturnType<typeof generateMonthlyReport>>
  try {
    generated = await generateMonthlyReport({
      officeId: input.officeId,
      userId: input.userId ?? null,
      month: periodDate,
      requestId: input.requestId,
    })
  } catch (error) {
    return { status: 'generation_failed' as const, officeId: input.officeId, periodDate, error: sanitizeDeliveryError(error) }
  }
  if (generated.status === 'no_activity') return { status: 'no_activity' as const, officeId: input.officeId, periodDate }

  const office = await prisma.office.findUnique({ where: { id: input.officeId }, select: { nombre: true } })
  const financialSummary = financialSummaryFromMetadata(generated.report.metadata)
    ?? await getMonthlyReportFinancialSummary({ officeId: input.officeId, month: periodDate })
  const email = buildMonthlyReportEmail({
    officeName: office?.nombre ?? `Oficina ${input.officeId}`,
    periodDate,
    qualifiedCount: generated.report.activityCount,
    financialSummary,
    downloadPath: reportDownloadPath(generated.report.id),
  })
  const result = await executeReportDelivery({
    officeId: input.officeId,
    userId: input.userId,
    requestId: input.requestId,
    mode: input.mode,
    target: input.target ?? 'all',
    previousAttemptId: input.previousAttemptId,
    idempotencyKey: input.idempotencyKey ?? scheduledReportIdempotencyKey({ officeId: input.officeId, reportType: MONTHLY_REPORT_TYPE, periodDate }),
    report: generated.report,
    adapter,
    email,
    shouldCancel: input.shouldCancel,
    onProgress: input.onProgress,
  })
  return { ...result, officeId: input.officeId, periodDate }
}

export async function sendMonthlyReportsForAllOffices(input: {
  periodDate?: string
  officeId?: number
  mode?: DeliveryMode
  adapter?: MailAdapter
  requestId?: string
}) {
  const periodDate = input.periodDate ?? previousChileMonthString()
  const offices = input.officeId
    ? [{ id: input.officeId }]
    : await prisma.office.findMany({
      where: { users: { some: { isActive: true, isOfficeAdmin: true } } },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
  const results = []
  for (const office of offices) {
    results.push(await sendMonthlyReportForOffice({
      officeId: office.id,
      periodDate,
      mode: input.mode ?? 'scheduled',
      adapter: input.adapter,
      requestId: input.requestId,
    }))
  }
  return { periodDate, officeCount: offices.length, results }
}
