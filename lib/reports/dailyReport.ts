import 'server-only'

import type { GeneratedReport } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { chileDayBounds } from './chileTime'
import { buildDailyAuditWorkbook } from './dailyWorkbook'
import { aggregateDeliveryStatus, DAILY_REPORT_TYPE } from './dailyDeliveryCore'
import { MONTHLY_REPORT_TYPE } from './monthlyCore'
import {
  ReportVersionError,
  cleanupReportVersions,
  deleteAllReportVersions,
  downloadVerifiedReportVersion,
  persistReportVersion,
} from './versioning'

const REPORT_STATUS_READY = 'ready'
const REPORT_STATUS_EXPIRED = 'expired'

export type DailyReportResult =
  | { status: 'generated'; report: GeneratedReport }
  | { status: 'existing'; report: GeneratedReport }
  | { status: 'no_activity'; periodDate: string; periodStart: Date; periodEnd: Date }

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

export async function listReportsForOffice(officeId: number) {
  const reports = await prisma.generatedReport.findMany({
    where: { officeId, reportType: { in: [DAILY_REPORT_TYPE, MONTHLY_REPORT_TYPE] } },
    orderBy: [{ periodStart: 'desc' }, { generatedAt: 'desc' }],
    take: 120,
    select: {
      id: true,
      reportType: true,
      periodDate: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      fileName: true,
      sizeBytes: true,
      activityCount: true,
      generatedAt: true,
      expiresAt: true,
      currentVersionId: true,
      currentVersion: {
        select: { id: true, versionNumber: true, status: true, checksumSha256: true, sizeBytes: true, generatedAt: true },
      },
      createdBy: { select: { email: true } },
      _count: { select: { versions: { where: { status: 'READY' } }, deliveryAttempts: true } },
      deliveryAttempts: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          intendedRecipientCount: true,
          sentCount: true,
          failedCount: true,
          skippedCount: true,
        },
      },
    },
  })

  return reports.map(report => {
    const latest = report.deliveryAttempts[0]
    return {
      ...report,
      deliveryStatus: latest
        ? aggregateDeliveryStatus([{
          intendedRecipientCount: latest.intendedRecipientCount,
          sentCount: latest.sentCount,
          failedCount: latest.failedCount,
        }])
        : 'not_sent' as const,
      latestDeliveryAttempt: latest ?? null,
      retainedVersionCount: report._count.versions,
      deliveryAttemptCount: report._count.deliveryAttempts,
      deliveryAttempts: undefined,
      _count: undefined,
    }
  })
}

/** Internal verified download used by report delivery. User downloads use the audited API route. */
export async function getReportForDownload(officeId: number, reportId: string) {
  try {
    return await downloadVerifiedReportVersion({ officeId, reportId })
  } catch (error) {
    if (error instanceof ReportVersionError && (error.reason === 'not_found' || error.reason === 'unavailable')) return null
    throw error
  }
}

export async function generateDailyReport(input: {
  officeId: number
  userId?: string | null
  date: string
  force?: boolean
  generationMode?: string
  cancellationCheck?: () => Promise<boolean>
  requestId?: string
}): Promise<DailyReportResult> {
  const bounds = chileDayBounds(input.date)
  const existing = await prisma.generatedReport.findUnique({
    where: {
      officeId_identityKey_periodStart_periodEnd: {
        officeId: input.officeId,
        identityKey: DAILY_REPORT_TYPE,
        periodStart: bounds.start,
        periodEnd: bounds.end,
      },
    },
  })
  if (existing?.status === REPORT_STATUS_READY && existing.currentVersionId && !input.force) {
    return { status: 'existing', report: existing }
  }

  const [office, events] = await Promise.all([
    prisma.office.findUnique({ where: { id: input.officeId }, select: { nombre: true } }),
    prisma.activityEvent.findMany({
      where: { officeId: input.officeId, occurredAt: { gte: bounds.start, lte: bounds.end } },
      include: { user: { select: { email: true } } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    }),
  ])
  if (!events.length) return { status: 'no_activity', periodDate: bounds.isoDate, periodStart: bounds.start, periodEnd: bounds.end }

  const generatedAt = new Date()
  const generationMode = input.generationMode ?? (input.force ? 'manual_force' : 'manual')
  const metadata = {
    eventCount: events.length,
    generatedFrom: 'ActivityEvent',
    force: !!input.force,
  }
  const persisted = await persistReportVersion({
    officeId: input.officeId,
    reportType: 'daily',
    periodStart: bounds.start,
    periodEnd: bounds.end,
    periodDate: bounds.isoDate,
    timezone: bounds.timezone,
    activityCount: events.length,
    generatedAt,
    expiresAt: addDays(generatedAt, 120),
    generatedByUserId: input.userId ?? null,
    generationMode,
    metadata,
    cancellationCheck: input.cancellationCheck,
    requestId: input.requestId,
    buildWorkbook: () => buildDailyAuditWorkbook({
      officeName: office?.nombre ?? `Oficina ${input.officeId}`,
      periodDate: bounds.isoDate,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      events,
      generatedAt,
    }),
  })
  return { status: 'generated', report: persisted.report }
}

export async function cleanupExpiredDailyReports(officeId: number, now = new Date()) {
  const reports = await prisma.generatedReport.findMany({
    where: { officeId, reportType: DAILY_REPORT_TYPE, status: REPORT_STATUS_READY, expiresAt: { lt: now } },
  })
  let expired = 0
  let deletionFailures = 0
  for (const report of reports) {
    await prisma.generatedReport.update({
      where: { id: report.id },
      data: { status: REPORT_STATUS_EXPIRED, currentVersionId: null, metadata: { expiredAt: now.toISOString(), previousStatus: report.status } },
    })
    const deleted = await deleteAllReportVersions(report.id)
    deletionFailures += deleted.failed
    expired += 1
  }
  const retried = await cleanupReportVersions(officeId)
  return { expired, deletionFailures, retried }
}
