import 'server-only'

import { randomUUID } from 'crypto'
import { Prisma, type GeneratedReport } from '@prisma/client'

import { prismaNoMiddleware } from '@/lib/prismaNoMiddleware'
import { chileDayBounds } from './chileTime'
import { buildDailyAuditWorkbook } from './dailyWorkbook'
import { deleteReportFile, downloadReportFile, uploadReportWorkbook } from './storage'

const DAILY_REPORT_TYPE = 'daily'
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
  return prismaNoMiddleware.generatedReport.findMany({
    where: { officeId, reportType: DAILY_REPORT_TYPE },
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
    },
  })
}

export async function getReportForDownload(officeId: number, reportId: string) {
  const report = await prismaNoMiddleware.generatedReport.findFirst({
    where: { id: reportId, officeId, status: REPORT_STATUS_READY },
  })
  if (!report) return null
  const buffer = await downloadReportFile(report.storageBucket, report.storageKey)
  return { report, buffer }
}

export async function generateDailyReport(input: {
  officeId: number
  userId: string
  date: string
  force?: boolean
}): Promise<DailyReportResult> {
  const bounds = chileDayBounds(input.date)
  const existing = await prismaNoMiddleware.generatedReport.findUnique({
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
    prismaNoMiddleware.office.findUnique({ where: { id: input.officeId }, select: { nombre: true } }),
    prismaNoMiddleware.activityEvent.findMany({
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
    createdByUserId: input.userId,
    generationMode: input.force ? 'manual_force' : 'manual',
    metadata: {
      eventCount: events.length,
      generatedFrom: 'ActivityEvent',
      force: !!input.force,
    },
  }

  if (existing) {
    const previous = { bucket: existing.storageBucket, key: existing.storageKey }
    const report = await prismaNoMiddleware.generatedReport.update({
      where: { id: existing.id },
      data,
    })
    deleteReportFile(previous.bucket, previous.key).catch(() => undefined)
    return { status: 'generated', report }
  }

  try {
    const report = await prismaNoMiddleware.generatedReport.create({
      data: {
        id: reportId,
        officeId: input.officeId,
        ...data,
      },
    })
    return { status: 'generated', report }
  } catch (error) {
    if (isUniqueConstraint(error)) {
      await deleteReportFile(stored.storageBucket, stored.storageKey).catch(() => undefined)
      const report = await prismaNoMiddleware.generatedReport.findUniqueOrThrow({
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
  const reports = await prismaNoMiddleware.generatedReport.findMany({
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
    await prismaNoMiddleware.generatedReport.update({
      where: { id: report.id },
      data: { status: REPORT_STATUS_EXPIRED, metadata: { expiredAt: now.toISOString(), previousStatus: report.status } },
    })
    expired += 1
  }
  return { expired }
}
