import 'server-only'

import type { Prisma, ReportDeliveryAttemptStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { aggregateDeliveryStatus } from './dailyDeliveryCore'
import { chileDayBounds } from './chileTime'
import {
  paginationResult,
  paginationSkip,
  type ReportDeliveryHistoryQuery,
  type ReportHistoryQuery,
  type ReportVersionHistoryQuery,
} from './historyCore'

function reportWhere(officeId: number, query: Pick<ReportHistoryQuery, 'reportId' | 'reportType' | 'dateFrom' | 'dateTo'>): Prisma.GeneratedReportWhereInput {
  return {
    officeId,
    ...(query.reportId ? { id: query.reportId } : {}),
    reportType: query.reportType === 'all' ? { in: ['daily', 'monthly', 'custom'] } : query.reportType,
    periodStart: {
      ...(query.dateFrom ? { gte: chileDayBounds(query.dateFrom).start } : {}),
      ...(query.dateTo ? { lte: chileDayBounds(query.dateTo).end } : {}),
    },
  }
}

function deliveryStatusFor(attempt: { status: ReportDeliveryAttemptStatus; intendedRecipientCount: number; sentCount: number; failedCount: number } | undefined) {
  if (!attempt) return 'not_sent' as const
  if (attempt.status === 'PENDING' || attempt.status === 'SENDING') return 'pending' as const
  return aggregateDeliveryStatus([attempt])
}

const latestAttemptSelect = {
  id: true,
  attemptNumber: true,
  status: true,
  intendedRecipientCount: true,
  sentCount: true,
  failedCount: true,
  skippedCount: true,
} satisfies Prisma.ReportDeliveryAttemptSelect

export async function listReportHistory(officeId: number, query: ReportHistoryQuery) {
  const where = {
    ...reportWhere(officeId, query),
    ...(query.status === 'all' ? {} : { status: query.status }),
  }
  const index = await prisma.generatedReport.findMany({
    where,
    orderBy: [{ periodStart: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      status: true,
      _count: { select: { versions: { where: { status: 'READY' } }, deliveryAttempts: true } },
      deliveryAttempts: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: latestAttemptSelect },
    },
  })

  const indexed = index.map(report => ({ ...report, deliveryStatus: deliveryStatusFor(report.deliveryAttempts[0]) }))
  const filtered = query.deliveryStatus === 'all' ? indexed : indexed.filter(report => report.deliveryStatus === query.deliveryStatus)
  const pageIds = filtered.slice(paginationSkip(query.page, query.limit), paginationSkip(query.page, query.limit) + query.limit).map(report => report.id)
  const rows = pageIds.length ? await prisma.generatedReport.findMany({
    where: { officeId, id: { in: pageIds } },
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
      currentVersion: { select: { id: true, versionNumber: true, status: true, checksumSha256: true, sizeBytes: true, generatedAt: true } },
      createdBy: { select: { email: true } },
      _count: { select: { versions: { where: { status: 'READY' } }, deliveryAttempts: true } },
      deliveryAttempts: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: latestAttemptSelect },
    },
  }) : []
  const byId = new Map(rows.map(report => [report.id, report]))
  const items = pageIds.flatMap(id => {
    const report = byId.get(id)
    if (!report) return []
    const latest = report.deliveryAttempts[0]
    return [{
      ...report,
      periodStart: report.periodStart.toISOString(),
      periodEnd: report.periodEnd.toISOString(),
      generatedAt: report.generatedAt.toISOString(),
      expiresAt: report.expiresAt?.toISOString() ?? null,
      currentVersion: report.currentVersion ? { ...report.currentVersion, generatedAt: report.currentVersion.generatedAt.toISOString() } : null,
      deliveryStatus: deliveryStatusFor(latest),
      latestDeliveryAttempt: latest ?? null,
      retainedVersionCount: report._count.versions,
      deliveryAttemptCount: report._count.deliveryAttempts,
      deliveryAttempts: undefined,
      _count: undefined,
    }]
  })

  return {
    items,
    pagination: paginationResult(query.page, query.limit, filtered.length),
    summary: {
      availableReports: indexed.filter(report => report.status === 'ready').length,
      retainedVersions: indexed.reduce((total, report) => total + report._count.versions, 0),
      deliveryAttempts: indexed.reduce((total, report) => total + report._count.deliveryAttempts, 0),
      needsAttention: indexed.filter(report => report.deliveryStatus === 'partial' || report.deliveryStatus === 'failed').length,
    },
  }
}

export async function listGlobalReportVersions(officeId: number, query: ReportVersionHistoryQuery) {
  const where: Prisma.GeneratedReportVersionWhereInput = {
    report: reportWhere(officeId, query),
    ...(query.status === 'all' ? {} : { status: query.status }),
    ...(query.scope === 'current' ? { currentForReport: { isNot: null } } : query.scope === 'historical' ? { currentForReport: { is: null } } : {}),
  }
  const [total, versions] = await Promise.all([
    prisma.generatedReportVersion.count({ where }),
    prisma.generatedReportVersion.findMany({
      where,
      orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
      skip: paginationSkip(query.page, query.limit),
      take: query.limit,
      select: {
        id: true,
        reportId: true,
        versionNumber: true,
        status: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        checksumSha256: true,
        generationMode: true,
        generatedAt: true,
        errorMessage: true,
        failedAt: true,
        deleteRequestedAt: true,
        deletedAt: true,
        generatedBy: { select: { email: true } },
        report: { select: { reportType: true, periodDate: true, currentVersionId: true, currentVersion: { select: { id: true, versionNumber: true } } } },
      },
    }),
  ])
  return {
    items: versions.map(version => ({
      ...version,
      generatedAt: version.generatedAt.toISOString(),
      failedAt: version.failedAt?.toISOString() ?? null,
      deleteRequestedAt: version.deleteRequestedAt?.toISOString() ?? null,
      deletedAt: version.deletedAt?.toISOString() ?? null,
      isCurrent: version.report.currentVersionId === version.id,
      report: { reportType: version.report.reportType, periodDate: version.report.periodDate, currentVersion: version.report.currentVersion },
    })),
    pagination: paginationResult(query.page, query.limit, total),
  }
}

export async function listGlobalDeliveryAttempts(officeId: number, query: ReportDeliveryHistoryQuery) {
  const where: Prisma.ReportDeliveryAttemptWhereInput = {
    officeId,
    report: reportWhere(officeId, query),
    ...(query.status === 'all' ? {} : { status: query.status }),
    ...(query.mode === 'all' ? {} : { mode: query.mode }),
    ...(query.target === 'all' ? {} : { target: query.target }),
  }
  const [total, attempts] = await Promise.all([
    prisma.reportDeliveryAttempt.count({ where }),
    prisma.reportDeliveryAttempt.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: paginationSkip(query.page, query.limit),
      take: query.limit,
      select: {
        id: true,
        attemptNumber: true,
        status: true,
        mode: true,
        target: true,
        parentAttemptId: true,
        intendedRecipientCount: true,
        sentCount: true,
        failedCount: true,
        skippedCount: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        requestedBy: { select: { email: true } },
        report: { select: { id: true, reportType: true, periodDate: true, currentVersionId: true, currentVersion: { select: { id: true, versionNumber: true } } } },
        reportVersion: { select: { id: true, versionNumber: true, checksumSha256: true, fileName: true } },
        parentAttempt: { select: { id: true, attemptNumber: true } },
        _count: { select: { retryAttempts: true, recipients: true } },
      },
    }),
  ])
  return {
    items: attempts.map(attempt => ({
      ...attempt,
      startedAt: attempt.startedAt?.toISOString() ?? null,
      completedAt: attempt.completedAt?.toISOString() ?? null,
      createdAt: attempt.createdAt.toISOString(),
      retryCount: attempt._count.retryAttempts,
      recipientCount: attempt._count.recipients,
      _count: undefined,
    })),
    pagination: paginationResult(query.page, query.limit, total),
  }
}

export async function getDeliveryAttemptDetail(officeId: number, attemptId: string) {
  const attempt = await prisma.reportDeliveryAttempt.findFirst({
    where: { id: attemptId, officeId },
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      mode: true,
      target: true,
      parentAttemptId: true,
      provider: true,
      fromAccount: true,
      intendedRecipientCount: true,
      sentCount: true,
      failedCount: true,
      skippedCount: true,
      errorMessage: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      requestedBy: { select: { email: true } },
      report: { select: { id: true, reportType: true, periodDate: true, currentVersionId: true, currentVersion: { select: { id: true, versionNumber: true } } } },
      reportVersion: { select: { id: true, versionNumber: true, checksumSha256: true, fileName: true, sizeBytes: true } },
      parentAttempt: { select: { id: true, attemptNumber: true, status: true } },
      retryAttempts: { orderBy: { attemptNumber: 'asc' }, select: { id: true, attemptNumber: true, status: true, createdAt: true } },
      recipients: {
        orderBy: [{ email: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          email: true,
          authorizationDecision: true,
          status: true,
          attemptCount: true,
          providerMessageId: true,
          providerThreadId: true,
          providerInternetMessageId: true,
          attachmentFilename: true,
          attachmentMimeType: true,
          attachmentByteSize: true,
          attachmentSha256: true,
          errorMessage: true,
          sentAt: true,
          completedAt: true,
        },
      },
    },
  })
  if (!attempt) return null
  return {
    ...attempt,
    startedAt: attempt.startedAt?.toISOString() ?? null,
    completedAt: attempt.completedAt?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
    retryAttempts: attempt.retryAttempts.map(retry => ({ ...retry, createdAt: retry.createdAt.toISOString() })),
    recipients: attempt.recipients.map(recipient => ({
      ...recipient,
      sentAt: recipient.sentAt?.toISOString() ?? null,
      completedAt: recipient.completedAt?.toISOString() ?? null,
    })),
  }
}
