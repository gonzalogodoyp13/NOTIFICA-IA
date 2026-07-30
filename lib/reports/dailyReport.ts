import 'server-only'

import { randomUUID } from 'crypto'
import { Prisma, type GeneratedReport } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { chileDayBounds } from './chileTime'
import { buildDailyAuditWorkbook } from './dailyWorkbook'
import { deleteReportFile, downloadReportFile, uploadReportWorkbook } from './storage'
import { aggregateDeliveryStatus, DAILY_REPORT_TYPE } from './dailyDeliveryCore'
import { MONTHLY_REPORT_TYPE } from './monthlyCore'
import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'

const REPORT_STATUS_READY = 'ready'
const REPORT_STATUS_EXPIRED = 'expired'

export type DailyReportResult =
  | { status: 'generated'; report: GeneratedReport }
  | { status: 'existing'; report: GeneratedReport }
  | { status: 'no_activity'; periodDate: string; periodStart: Date; periodEnd: Date }

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}
function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
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
      createdBy: { select: { email: true } },
      deliveryBatches: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          intendedRecipientCount: true,
          sentCount: true,
          failedCount: true,
          recipients: { select: { status: true } },
        },
      },
    },
  })

  return reports.map(report => ({
    ...report,
    deliveryStatus: aggregateDeliveryStatus(report.deliveryBatches),
    deliveryBatches: undefined,
  }))
}

export async function getReportForDownload(officeId: number, reportId: string) {
  const report = await prisma.generatedReport.findFirst({
    where: { id: reportId, officeId, status: REPORT_STATUS_READY },
  })
  if (!report) return null
  const buffer = await downloadReportFile(report.storageBucket, report.storageKey)
  return { report, buffer }
}

export async function generateDailyReport(input: {
  officeId: number
  userId?: string | null
  date: string
  force?: boolean
  generationMode?: string
  requestId?: string
}): Promise<DailyReportResult> {
  const bounds = chileDayBounds(input.date)
  const existing = await prisma.generatedReport.findUnique({
    where: {
      officeId_reportType_periodStart_periodEnd: {
        officeId: input.officeId,
        reportType: DAILY_REPORT_TYPE,
        periodStart: bounds.start,
        periodEnd: bounds.end,
      },
    },
  })
  if (existing && !input.force) return { status: 'existing', report: existing }

  const [office, events] = await Promise.all([
    prisma.office.findUnique({ where: { id: input.officeId }, select: { nombre: true } }),
    prisma.activityEvent.findMany({
      where: {
        officeId: input.officeId,
        occurredAt: { gte: bounds.start, lte: bounds.end },
      },
      include: { user: { select: { email: true } } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    }),
  ])

  if (!events.length) return { status: 'no_activity', periodDate: bounds.isoDate, periodStart: bounds.start, periodEnd: bounds.end }

  const now = new Date()
  const reportId = existing?.id ?? randomUUID()
  const workbook = await buildDailyAuditWorkbook({
    officeName: office?.nombre ?? `Oficina ${input.officeId}`,
    periodDate: bounds.isoDate,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    events,
    generatedAt: now,
  })
  const stored = await uploadReportWorkbook({
    buffer: workbook,
    officeId: input.officeId,
    periodDate: bounds.isoDate,
    reportId: existing ? `${reportId}-${Date.now()}` : reportId,
  })

  const data = {
    reportType: DAILY_REPORT_TYPE,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    periodDate: bounds.isoDate,
    timezone: bounds.timezone,
    status: REPORT_STATUS_READY,
    storageBucket: stored.storageBucket,
    storageKey: stored.storageKey,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    checksumSha256: stored.checksumSha256,
    activityCount: events.length,
    generatedAt: now,
    expiresAt: addDays(now, 120),
    createdByUserId: input.userId ?? null,
    generationMode: input.generationMode ?? (input.force ? 'manual_force' : 'manual'),
    metadata: {
      eventCount: events.length,
      generatedFrom: 'ActivityEvent',
      force: !!input.force,
    },
  }

  if (existing) {
    const previous = { bucket: existing.storageBucket, key: existing.storageKey }
    const report = await prisma.$transaction(async tx => {
      const updated = await tx.generatedReport.update({ where: { id: existing.id }, data })
      await enqueueExternalEvent(tx, {
        id: input.userId ?? undefined, officeId: input.officeId, requestId: input.requestId,
        actorType: input.userId ? 'USER' : 'SYSTEM', source: input.userId ? 'WEB' : 'SYSTEM',
      }, {
        eventType: 'report.daily.generated', module: 'reports', result: 'success',
        recordType: 'GeneratedReport', recordId: updated.id, description: 'Reporte diario generado.',
        deduplicationKey: `report:${updated.id}:${stored.checksumSha256}`,
        metadata: { reportId: updated.id, reportType: updated.reportType, periodDate: updated.periodDate, activityCount: updated.activityCount },
      })
      return updated
    })
    await processActivityOutbox(50).catch(() => undefined)
    deleteReportFile(previous.bucket, previous.key).catch(() => undefined)
    return { status: 'generated', report }
  }

  try {
    const report = await prisma.$transaction(async tx => {
      const created = await tx.generatedReport.create({ data: { id: reportId, officeId: input.officeId, ...data } })
      await enqueueExternalEvent(tx, {
        id: input.userId ?? undefined, officeId: input.officeId, requestId: input.requestId,
        actorType: input.userId ? 'USER' : 'SYSTEM', source: input.userId ? 'WEB' : 'SYSTEM',
      }, {
        eventType: 'report.daily.generated', module: 'reports', result: 'success',
        recordType: 'GeneratedReport', recordId: created.id, description: 'Reporte diario generado.',
        deduplicationKey: `report:${created.id}:${stored.checksumSha256}`,
        metadata: { reportId: created.id, reportType: created.reportType, periodDate: created.periodDate, activityCount: created.activityCount },
      })
      return created
    })
    await processActivityOutbox(50).catch(() => undefined)
    return { status: 'generated', report }
  } catch (error) {
    if (isUniqueConstraint(error)) {
      await deleteReportFile(stored.storageBucket, stored.storageKey).catch(() => undefined)
      const report = await prisma.generatedReport.findUniqueOrThrow({
        where: {
          officeId_reportType_periodStart_periodEnd: {
            officeId: input.officeId,
            reportType: DAILY_REPORT_TYPE,
            periodStart: bounds.start,
            periodEnd: bounds.end,
          },
        },
      })
      return { status: 'existing', report }
    }
    await deleteReportFile(stored.storageBucket, stored.storageKey).catch(() => undefined)
    throw error
  }
}

export async function cleanupExpiredDailyReports(officeId: number, now = new Date()) {
  const reports = await prisma.generatedReport.findMany({
    where: {
      officeId,
      reportType: DAILY_REPORT_TYPE,
      status: REPORT_STATUS_READY,
      expiresAt: { lt: now },
    },
  })

  let expired = 0
  for (const report of reports) {
    await deleteReportFile(report.storageBucket, report.storageKey).catch(() => undefined)
    await prisma.generatedReport.update({
      where: { id: report.id },
      data: { status: REPORT_STATUS_EXPIRED, metadata: { expiredAt: now.toISOString(), previousStatus: report.status } },
    })
    expired += 1
  }
  return { expired }
}
