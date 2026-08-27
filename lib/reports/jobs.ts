import 'server-only'

import {
  Prisma,
  ReportJobOrigin,
  ReportJobRunOutcome,
  ReportJobStatus,
  ReportJobType,
  type ReportJob,
} from '@prisma/client'

import { ApiError } from '@/lib/api/server'
import { recordBestEffortEvent } from '@/lib/audit/activityEvent'
import { prisma } from '@/lib/prisma'
import { createMailAdapter } from '@/lib/recibos/mailer'
import { asJsonObject } from '@/lib/utils/json'
import {
  JobListQuerySchema,
  isTransientReportError,
  nextScheduleRun,
  reportRetryDelayMs,
  safeReportError,
  schedulePeriod,
} from './automationCore'
import { chileDayBounds, chileMonthBounds } from './chileTime'
import { generateCustomReport } from './customReports'
import { sendDailyReportForOffice } from './dailyDelivery'
import { executeReportDelivery, validateReportIdempotencyKey } from './deliveryAttempts'
import { generateDailyReport } from './dailyReport'
import { sendMonthlyReportForOffice } from './monthlyDelivery'
import { generateMonthlyReport } from './monthlyReport'

const LEASE_MS = 10 * 60_000
const TERMINAL_JOB_STATUSES: ReportJobStatus[] = [ReportJobStatus.SUCCEEDED, ReportJobStatus.FAILED, ReportJobStatus.CANCELLED]

type JobPayload = {
  force?: boolean
  deliverAfter?: boolean
  target?: 'all' | 'failed'
  previousAttemptId?: string
  reportId?: string
}

class TransientDeliveryError extends Error {
  readonly transient = true
  constructor(public readonly attemptId: string, message: string) { super(message); this.name = 'TransientDeliveryError' }
}

function jobPayload(job: Pick<ReportJob, 'payload'>): JobPayload {
  const value = asJsonObject(job.payload)
  return {
    force: value?.force === true,
    deliverAfter: value?.deliverAfter === true,
    target: value?.target === 'failed' ? 'failed' : 'all',
    previousAttemptId: typeof value?.previousAttemptId === 'string' ? value.previousAttemptId : undefined,
    reportId: typeof value?.reportId === 'string' ? value.reportId : undefined,
  }
}

export function serializeReportJob(job: ReportJob & { runs?: unknown[]; retryOfJob?: unknown; retryJobs?: unknown[] }) {
  return {
    ...job,
    requestedPeriodStart: job.requestedPeriodStart.toISOString(),
    requestedPeriodEnd: job.requestedPeriodEnd.toISOString(),
    availableAt: job.availableAt.toISOString(),
    scheduledFor: job.scheduledFor?.toISOString() ?? null,
    claimedAt: job.claimedAt?.toISOString() ?? null,
    leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
    heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
    cancelRequestedAt: job.cancelRequestedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  }
}

export async function enqueueReportJob(input: {
  officeId: number
  type: 'GENERATE' | 'DELIVER'
  origin: 'MANUAL' | 'SCHEDULED' | 'CHAINED'
  reportKind: 'daily' | 'monthly' | 'custom'
  customDefinitionId?: string | null
  scheduleId?: string | null
  retryOfJobId?: string | null
  requestedByUserId?: string | null
  idempotencyKey: string
  periodStart: Date
  periodEnd: Date
  periodLabel: string
  scheduledFor?: Date | null
  availableAt?: Date
  payload?: JobPayload
}) {
  const key = validateReportIdempotencyKey(input.idempotencyKey)
  const existing = await prisma.reportJob.findUnique({ where: { officeId_idempotencyKey: { officeId: input.officeId, idempotencyKey: key } } })
  if (existing) {
    if (existing.type !== input.type || existing.reportKind !== input.reportKind || existing.requestedPeriodStart.getTime() !== input.periodStart.getTime() || existing.requestedPeriodEnd.getTime() !== input.periodEnd.getTime()) {
      throw new ApiError('IDEMPOTENCY_KEY_REUSED', 'La clave de idempotencia ya fue usada para otro trabajo.', 409)
    }
    return existing
  }
  try {
    const job = await prisma.reportJob.create({ data: {
      officeId: input.officeId,
      type: input.type === 'GENERATE' ? ReportJobType.GENERATE : ReportJobType.DELIVER,
      status: ReportJobStatus.QUEUED,
      origin: input.origin === 'SCHEDULED' ? ReportJobOrigin.SCHEDULED : input.origin === 'CHAINED' ? ReportJobOrigin.CHAINED : ReportJobOrigin.MANUAL,
      reportKind: input.reportKind,
      customDefinitionId: input.customDefinitionId ?? null,
      scheduleId: input.scheduleId ?? null,
      retryOfJobId: input.retryOfJobId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      idempotencyKey: key,
      requestedPeriodStart: input.periodStart,
      requestedPeriodEnd: input.periodEnd,
      requestedPeriodLabel: input.periodLabel,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      scheduledFor: input.scheduledFor ?? null,
      availableAt: input.availableAt ?? new Date(),
      progressPhase: 'queued',
      completedUnits: 0,
      totalUnits: 1,
    } })
    await recordBestEffortEvent({ id: input.requestedByUserId ?? undefined, officeId: input.officeId, actorType: input.requestedByUserId ? 'USER' : 'SYSTEM', source: input.requestedByUserId ? 'WEB' : 'SYSTEM' }, {
      eventType: 'report.job.queued', module: 'reports', result: 'success', recordType: 'ReportJob', recordId: job.id,
      description: 'Trabajo durable de reportes encolado.', metadata: { type: job.type, origin: job.origin, reportKind: job.reportKind, period: job.requestedPeriodLabel },
    })
    return job
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.reportJob.findUniqueOrThrow({ where: { officeId_idempotencyKey: { officeId: input.officeId, idempotencyKey: key } } })
    }
    throw error
  }
}

export async function enqueueManualGeneration(input: { officeId: number; userId: string; kind: 'daily' | 'monthly'; period: string; force?: boolean; idempotencyKey: string }) {
  const bounds = input.kind === 'daily' ? chileDayBounds(input.period) : chileMonthBounds(input.period)
  return enqueueReportJob({ officeId: input.officeId, type: 'GENERATE', origin: 'MANUAL', reportKind: input.kind, requestedByUserId: input.userId, idempotencyKey: input.idempotencyKey, periodStart: bounds.start, periodEnd: bounds.end, periodLabel: input.period, payload: { force: !!input.force } })
}

export async function enqueueManualDelivery(input: { officeId: number; userId: string; kind: 'daily' | 'monthly'; period: string; target: 'all' | 'failed'; previousAttemptId?: string; idempotencyKey: string }) {
  const bounds = input.kind === 'daily' ? chileDayBounds(input.period) : chileMonthBounds(input.period)
  const parent = input.target === 'failed' && input.previousAttemptId
    ? await prisma.reportDeliveryAttempt.findFirst({ where: { id: input.previousAttemptId, officeId: input.officeId }, select: { reportId: true } })
    : null
  if (input.target === 'failed' && !parent) throw new ApiError('NOT_FOUND', 'El intento anterior no existe.', 404)
  const report = parent?.reportId
    ? await prisma.generatedReport.findFirst({ where: { id: parent.reportId, officeId: input.officeId } })
    : await prisma.generatedReport.findUnique({ where: { officeId_identityKey_periodStart_periodEnd: { officeId: input.officeId, identityKey: input.kind, periodStart: bounds.start, periodEnd: bounds.end } } })
  if (!report?.currentVersionId && input.target === 'all') {
    return enqueueReportJob({ officeId: input.officeId, type: 'GENERATE', origin: 'MANUAL', reportKind: input.kind, requestedByUserId: input.userId, idempotencyKey: input.idempotencyKey, periodStart: bounds.start, periodEnd: bounds.end, periodLabel: input.period, payload: { deliverAfter: true, target: input.target } })
  }
  if (!report) throw new ApiError('NOT_FOUND', 'No existe un reporte utilizable para reintentar.', 404)
  return enqueueReportJob({ officeId: input.officeId, type: 'DELIVER', origin: 'MANUAL', reportKind: input.kind, requestedByUserId: input.userId, idempotencyKey: input.idempotencyKey, periodStart: bounds.start, periodEnd: bounds.end, periodLabel: input.period, payload: { target: input.target, previousAttemptId: input.previousAttemptId, reportId: report.id } })
}

export async function enqueueReportDeliveryById(input: { officeId: number; userId: string; reportId: string; target: 'all' | 'failed'; previousAttemptId?: string; idempotencyKey: string }) {
  const report = await prisma.generatedReport.findFirst({ where: { id: input.reportId, officeId: input.officeId } })
  if (!report) throw new ApiError('NOT_FOUND', 'El reporte no existe.', 404)
  if (!['daily', 'monthly', 'custom'].includes(report.reportType)) throw new ApiError('VALIDATION_ERROR', 'El tipo de reporte no admite entrega.', 400)
  if (input.target === 'failed') {
    const parent = await prisma.reportDeliveryAttempt.findFirst({ where: { id: input.previousAttemptId ?? '', officeId: input.officeId, reportId: report.id }, select: { id: true } })
    if (!parent) throw new ApiError('NOT_FOUND', 'El intento anterior no existe.', 404)
  }
  if (!report.currentVersionId && input.target === 'all') throw new ApiError('CONFLICT', 'El reporte no tiene una versión actual disponible.', 409)
  return enqueueReportJob({ officeId: input.officeId, type: 'DELIVER', origin: 'MANUAL', reportKind: report.reportType as 'daily' | 'monthly' | 'custom', customDefinitionId: report.customDefinitionId, requestedByUserId: input.userId, idempotencyKey: input.idempotencyKey, periodStart: report.periodStart, periodEnd: report.periodEnd, periodLabel: report.periodDate, payload: { target: input.target, previousAttemptId: input.previousAttemptId, reportId: report.id } })
}

export async function listReportJobs(officeId: number, input: unknown) {
  const query = JobListQuerySchema.parse(input)
  const where: Prisma.ReportJobWhereInput = {
    officeId,
    ...(query.status === 'all' ? {} : { status: query.status }),
    ...(query.type === 'all' ? {} : { type: query.type }),
    ...(query.reportKind === 'all' ? {} : { reportKind: query.reportKind }),
    ...(query.origin === 'all' ? {} : { origin: query.origin }),
  }
  const [items, total, grouped] = await Promise.all([
    prisma.reportJob.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit, include: { requestedBy: { select: { email: true } }, customDefinition: { select: { name: true } }, _count: { select: { runs: true, retryJobs: true } } } }),
    prisma.reportJob.count({ where }),
    prisma.reportJob.groupBy({ by: ['status'], where: { officeId }, _count: { _all: true } }),
  ])
  return { items: items.map(serializeReportJob), pagination: { page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 }, summary: Object.fromEntries(grouped.map(row => [row.status, row._count._all])) }
}

export async function getReportJob(officeId: number, jobId: string) {
  const job = await prisma.reportJob.findFirst({ where: { id: jobId, officeId }, include: {
    requestedBy: { select: { email: true } }, customDefinition: { select: { id: true, name: true } },
    runs: { orderBy: { attemptNumber: 'desc' } }, retryOfJob: { select: { id: true, status: true } }, retryJobs: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true } },
    report: { select: { id: true, reportType: true, periodDate: true } }, reportVersion: { select: { id: true, versionNumber: true, checksumSha256: true } }, deliveryAttempt: { select: { id: true, attemptNumber: true, status: true } },
  } })
  return job ? serializeReportJob(job) : null
}

export async function cancelReportJob(input: { officeId: number; jobId: string; actorUserId: string; requestId?: string }) {
  const job = await prisma.reportJob.findFirst({ where: { id: input.jobId, officeId: input.officeId } })
  if (!job) throw new ApiError('NOT_FOUND', 'El trabajo no existe.', 404)
  if (TERMINAL_JOB_STATUSES.includes(job.status)) return job
  const now = new Date()
  const updated = await prisma.reportJob.update({ where: { id: job.id }, data: job.status === 'QUEUED'
    ? { status: 'CANCELLED', progressPhase: 'cancelled', cancelRequestedAt: now, completedAt: now, resultCode: 'CANCELLED' }
    : { status: 'CANCEL_REQUESTED', progressPhase: 'cancelling', cancelRequestedAt: now }
  })
  await recordBestEffortEvent({ id: input.actorUserId, officeId: input.officeId, requestId: input.requestId }, { eventType: 'report.job.cancel_requested', module: 'reports', result: 'success', recordType: 'ReportJob', recordId: job.id, description: 'Cancelación de trabajo solicitada.', metadata: { previousStatus: job.status, status: updated.status } })
  return updated
}

export async function retryReportJob(input: { officeId: number; jobId: string; actorUserId: string; idempotencyKey: string }) {
  const job = await prisma.reportJob.findFirst({ where: { id: input.jobId, officeId: input.officeId } })
  if (!job) throw new ApiError('NOT_FOUND', 'El trabajo no existe.', 404)
  if (!([ReportJobStatus.FAILED, ReportJobStatus.CANCELLED] as ReportJobStatus[]).includes(job.status)) throw new ApiError('CONFLICT', 'Solo se pueden reintentar trabajos fallidos o cancelados.', 409)
  const retry = await enqueueReportJob({ officeId: job.officeId, type: job.type, origin: 'MANUAL', reportKind: job.reportKind as 'daily' | 'monthly' | 'custom', customDefinitionId: job.customDefinitionId, retryOfJobId: job.id, requestedByUserId: input.actorUserId, idempotencyKey: input.idempotencyKey, periodStart: job.requestedPeriodStart, periodEnd: job.requestedPeriodEnd, periodLabel: job.requestedPeriodLabel, payload: jobPayload(job) })
  await recordBestEffortEvent({ id: input.actorUserId, officeId: input.officeId }, { eventType: 'report.job.retried', module: 'reports', result: 'success', recordType: 'ReportJob', recordId: retry.id, description: 'Reintento manual de trabajo encolado.', metadata: { retryOfJobId: job.id } })
  return retry
}

async function claimNextReportJob() {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH candidate AS (
        SELECT "id" FROM "report_jobs"
        WHERE "status" = 'QUEUED'::"ReportJobStatus" AND "availableAt" <= NOW()
        ORDER BY "availableAt" ASC, "createdAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "report_jobs" job
      SET "status" = 'RUNNING'::"ReportJobStatus",
          "claimedAt" = NOW(),
          "startedAt" = COALESCE(job."startedAt", NOW()),
          "heartbeatAt" = NOW(),
          "leaseExpiresAt" = NOW() + INTERVAL '10 minutes',
          "attemptCount" = job."attemptCount" + 1,
          "progressPhase" = 'starting',
          "updatedAt" = NOW()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job."id"
    `)
    if (!rows[0]) return null
    const job = await tx.reportJob.findUniqueOrThrow({ where: { id: rows[0].id } })
    await tx.reportJobRun.create({ data: { jobId: job.id, attemptNumber: job.attemptCount, outcome: ReportJobRunOutcome.RUNNING } })
    return job
  })
}

async function heartbeat(jobId: string, phase: string, completedUnits?: number, totalUnits?: number) {
  await prisma.reportJob.updateMany({ where: { id: jobId, status: { in: ['RUNNING', 'CANCEL_REQUESTED'] } }, data: {
    progressPhase: phase, ...(completedUnits === undefined ? {} : { completedUnits }), ...(totalUnits === undefined ? {} : { totalUnits }), heartbeatAt: new Date(), leaseExpiresAt: new Date(Date.now() + LEASE_MS),
  } })
}

async function cancellationRequested(jobId: string) {
  return !!await prisma.reportJob.findFirst({ where: { id: jobId, status: 'CANCEL_REQUESTED' }, select: { id: true } })
}

async function customDelivery(job: ReportJob, payload: JobPayload) {
  const report = await prisma.generatedReport.findFirst({ where: { id: payload.reportId, officeId: job.officeId, reportType: 'custom' }, include: { customDefinition: { select: { name: true } } } })
  if (!report) throw new ApiError('NOT_FOUND', 'El reporte personalizado no existe.', 404)
  return executeReportDelivery({
    officeId: job.officeId, userId: job.requestedByUserId, mode: job.origin === 'SCHEDULED' || !!job.scheduleId ? 'scheduled' : 'manual', target: payload.target ?? 'all', previousAttemptId: payload.previousAttemptId,
    idempotencyKey: `${job.id}:delivery:${job.attemptCount}`, report, adapter: createMailAdapter(),
    email: { subject: `Reporte personalizado · ${report.customDefinition?.name ?? report.periodDate}`, text: `El reporte personalizado ${report.customDefinition?.name ?? ''} para ${report.periodDate} está disponible en el centro de Reportes.` },
    shouldCancel: () => cancellationRequested(job.id), onProgress: (completed, total, phase) => heartbeat(job.id, phase, completed, Math.max(total, 1)),
  })
}

async function executeClaimedJob(job: ReportJob) {
  const payload = jobPayload(job)
  await heartbeat(job.id, 'validating', 0, 1)
  if (await cancellationRequested(job.id)) throw new ApiError('CONFLICT', 'Trabajo cancelado.', 409)
  if (job.type === ReportJobType.GENERATE) {
    let generated: Awaited<ReturnType<typeof generateDailyReport>> | Awaited<ReturnType<typeof generateMonthlyReport>> | Awaited<ReturnType<typeof generateCustomReport>>
    if (job.reportKind === 'daily') generated = await generateDailyReport({ officeId: job.officeId, userId: job.requestedByUserId, date: job.requestedPeriodLabel, force: payload.force, generationMode: job.origin === 'SCHEDULED' ? 'scheduled' : payload.force ? 'manual_force' : 'manual_job', cancellationCheck: () => cancellationRequested(job.id) })
    else if (job.reportKind === 'monthly') generated = await generateMonthlyReport({ officeId: job.officeId, userId: job.requestedByUserId, month: job.requestedPeriodLabel, force: payload.force, generationMode: job.origin === 'SCHEDULED' ? 'scheduled' : payload.force ? 'manual_force' : 'manual_job', cancellationCheck: () => cancellationRequested(job.id) })
    else if (job.customDefinitionId) generated = await generateCustomReport({ officeId: job.officeId, definitionId: job.customDefinitionId, periodStart: job.requestedPeriodStart, periodEnd: job.requestedPeriodEnd, periodLabel: job.requestedPeriodLabel, userId: job.requestedByUserId, generationMode: job.origin === 'SCHEDULED' ? 'scheduled' : 'manual_job', force: payload.force, cancellationCheck: () => cancellationRequested(job.id) })
    else throw new ApiError('VALIDATION_ERROR', 'El trabajo personalizado no tiene definición.', 400)
    if (generated.status === 'no_activity') return { resultCode: 'NO_ACTIVITY', reportId: null, reportVersionId: null, deliveryAttemptId: null }
    const report = generated.report
    if (payload.deliverAfter) await enqueueReportJob({ officeId: job.officeId, type: 'DELIVER', origin: 'CHAINED', reportKind: job.reportKind as 'daily' | 'monthly' | 'custom', customDefinitionId: job.customDefinitionId, scheduleId: job.scheduleId, requestedByUserId: job.requestedByUserId, idempotencyKey: `${job.id}:deliver`, periodStart: job.requestedPeriodStart, periodEnd: job.requestedPeriodEnd, periodLabel: job.requestedPeriodLabel, payload: { target: payload.target, reportId: report.id } })
    return { resultCode: generated.status.toUpperCase(), reportId: report.id, reportVersionId: report.currentVersionId, deliveryAttemptId: null }
  }

  let delivered
  if (job.reportKind === 'daily') delivered = await sendDailyReportForOffice({ officeId: job.officeId, periodDate: job.requestedPeriodLabel, mode: job.origin === 'SCHEDULED' || !!job.scheduleId ? 'scheduled' : 'manual', target: payload.target, previousAttemptId: payload.previousAttemptId, idempotencyKey: `${job.id}:delivery:${job.attemptCount}`, userId: job.requestedByUserId, shouldCancel: () => cancellationRequested(job.id), onProgress: (completed, total, phase) => heartbeat(job.id, phase, completed, Math.max(total, 1)) })
  else if (job.reportKind === 'monthly') delivered = await sendMonthlyReportForOffice({ officeId: job.officeId, periodDate: job.requestedPeriodLabel, mode: job.origin === 'SCHEDULED' || !!job.scheduleId ? 'scheduled' : 'manual', target: payload.target, previousAttemptId: payload.previousAttemptId, idempotencyKey: `${job.id}:delivery:${job.attemptCount}`, userId: job.requestedByUserId, shouldCancel: () => cancellationRequested(job.id), onProgress: (completed, total, phase) => heartbeat(job.id, phase, completed, Math.max(total, 1)) })
  else delivered = await customDelivery(job, payload)
  if ('status' in delivered && delivered.status === 'generation_failed' && 'error' in delivered) throw new Error(String(delivered.error))
  if ('status' in delivered && delivered.status === 'no_activity') return { resultCode: 'NO_ACTIVITY', reportId: null, reportVersionId: null, deliveryAttemptId: null }
  if ('status' in delivered && ['failed', 'partial'].includes(String(delivered.status).toLowerCase()) && 'attemptId' in delivered) {
    throw new TransientDeliveryError(String(delivered.attemptId), 'La entrega tuvo destinatarios fallidos y se reintentará de forma fijada.')
  }
  return { resultCode: String(delivered.status).toUpperCase(), reportId: 'reportId' in delivered ? delivered.reportId : null, reportVersionId: 'reportVersionId' in delivered ? delivered.reportVersionId : null, deliveryAttemptId: 'attemptId' in delivered ? delivered.attemptId : null }
}

async function updateScheduleForTerminal(job: ReportJob, success: boolean, safeError?: string | null) {
  if (!job.scheduleId) return
  await prisma.reportSchedule.updateMany({ where: { id: job.scheduleId }, data: success
    ? { lastSuccessAt: new Date(), consecutiveFailures: 0, safeLastError: null }
    : { lastFailureAt: new Date(), consecutiveFailures: { increment: 1 }, safeLastError: safeError ?? 'La ejecución programada falló.' }
  })
}

async function processClaimedJob(job: ReportJob) {
  try {
    const result = await executeClaimedJob(job)
    if (await cancellationRequested(job.id)) {
      const now = new Date()
      await prisma.$transaction([
        prisma.reportJob.update({ where: { id: job.id }, data: { status: 'CANCELLED', progressPhase: 'cancelled', resultCode: 'CANCELLED', completedAt: now, leaseExpiresAt: null } }),
        prisma.reportJobRun.update({ where: { jobId_attemptNumber: { jobId: job.id, attemptNumber: job.attemptCount } }, data: { outcome: 'CANCELLED', resultCode: 'CANCELLED', completedAt: now } }),
      ])
      return 'cancelled'
    }
    const now = new Date()
    await prisma.$transaction([
      prisma.reportJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', progressPhase: 'completed', completedUnits: 1, totalUnits: 1, resultCode: result.resultCode, reportId: result.reportId, reportVersionId: result.reportVersionId, deliveryAttemptId: result.deliveryAttemptId, completedAt: now, leaseExpiresAt: null, safeError: null } }),
      prisma.reportJobRun.update({ where: { jobId_attemptNumber: { jobId: job.id, attemptNumber: job.attemptCount } }, data: { outcome: 'SUCCEEDED', resultCode: result.resultCode, completedAt: now } }),
    ])
    await updateScheduleForTerminal(job, true)
    await recordBestEffortEvent({ id: job.requestedByUserId ?? undefined, officeId: job.officeId, actorType: job.requestedByUserId ? 'USER' : 'SYSTEM', source: job.requestedByUserId ? 'WEB' : 'SYSTEM' }, { eventType: 'report.job.succeeded', module: 'reports', result: 'success', recordType: 'ReportJob', recordId: job.id, description: 'Trabajo de reportes completado.', metadata: { type: job.type, reportKind: job.reportKind, resultCode: result.resultCode, attemptCount: job.attemptCount } })
    return 'succeeded'
  } catch (error) {
    const safeError = safeReportError(error)
    const cancelled = await cancellationRequested(job.id)
    const retryable = !cancelled && (error instanceof TransientDeliveryError || isTransientReportError(error)) && job.attemptCount < job.maxAttempts
    const now = new Date()
    if (retryable) {
      await prisma.$transaction([
        prisma.reportJob.update({ where: { id: job.id }, data: { status: 'QUEUED', progressPhase: 'retry_wait', availableAt: new Date(now.getTime() + reportRetryDelayMs(job.attemptCount)), leaseExpiresAt: null, heartbeatAt: now, safeError, ...(error instanceof TransientDeliveryError ? { payload: { ...jobPayload(job), target: 'failed', previousAttemptId: error.attemptId } } : {}) } }),
        prisma.reportJobRun.update({ where: { jobId_attemptNumber: { jobId: job.id, attemptNumber: job.attemptCount } }, data: { outcome: 'RETRY_SCHEDULED', resultCode: 'TRANSIENT_FAILURE', safeError, completedAt: now } }),
      ])
      return 'retry_scheduled'
    }
    const status = cancelled ? ReportJobStatus.CANCELLED : ReportJobStatus.FAILED
    await prisma.$transaction([
      prisma.reportJob.update({ where: { id: job.id }, data: { status, progressPhase: cancelled ? 'cancelled' : 'failed', resultCode: cancelled ? 'CANCELLED' : 'FAILED', safeError, completedAt: now, leaseExpiresAt: null } }),
      prisma.reportJobRun.update({ where: { jobId_attemptNumber: { jobId: job.id, attemptNumber: job.attemptCount } }, data: { outcome: cancelled ? 'CANCELLED' : 'FAILED', resultCode: cancelled ? 'CANCELLED' : 'FAILED', safeError, completedAt: now } }),
    ])
    await updateScheduleForTerminal(job, false, safeError)
    await recordBestEffortEvent({ id: job.requestedByUserId ?? undefined, officeId: job.officeId, actorType: job.requestedByUserId ? 'USER' : 'SYSTEM', source: job.requestedByUserId ? 'WEB' : 'SYSTEM' }, { eventType: cancelled ? 'report.job.cancelled' : 'report.job.failed', module: 'reports', result: cancelled ? 'success' : 'failure', recordType: 'ReportJob', recordId: job.id, description: cancelled ? 'Trabajo de reportes cancelado.' : 'Trabajo de reportes fallido.', metadata: { type: job.type, reportKind: job.reportKind, attemptCount: job.attemptCount, resultCode: cancelled ? 'CANCELLED' : 'FAILED' } })
    return status.toLowerCase()
  }
}

export async function recoverExpiredReportJobs(now = new Date()) {
  const stale = await prisma.reportJob.findMany({ where: { status: { in: ['RUNNING', 'CANCEL_REQUESTED'] }, leaseExpiresAt: { lt: now } }, orderBy: { leaseExpiresAt: 'asc' }, take: 100 })
  let requeued = 0; let failed = 0; let cancelled = 0
  for (const job of stale) {
    const status = job.status === 'CANCEL_REQUESTED' ? 'CANCELLED' : job.attemptCount < job.maxAttempts ? 'QUEUED' : 'FAILED'
    await prisma.$transaction([
      prisma.reportJob.update({ where: { id: job.id }, data: { status, progressPhase: status === 'QUEUED' ? 'recovered' : status.toLowerCase(), availableAt: status === 'QUEUED' ? now : job.availableAt, leaseExpiresAt: null, safeError: status === 'FAILED' ? 'El trabajo agotó sus intentos después de perder el lease.' : job.safeError, completedAt: status === 'QUEUED' ? null : now } }),
      prisma.reportJobRun.updateMany({ where: { jobId: job.id, attemptNumber: job.attemptCount, outcome: 'RUNNING' }, data: { outcome: status === 'QUEUED' ? 'RETRY_SCHEDULED' : status === 'CANCELLED' ? 'CANCELLED' : 'FAILED', resultCode: 'LEASE_EXPIRED', safeError: 'El lease del trabajo expiró.', completedAt: now } }),
    ])
    if (status === 'QUEUED') requeued += 1; else if (status === 'FAILED') failed += 1; else cancelled += 1
  }
  return { found: stale.length, requeued, failed, cancelled }
}

export async function enqueueDueSchedules(now = new Date()) {
  const schedules = await prisma.reportSchedule.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }], take: 100 })
  let enqueued = 0
  for (const schedule of schedules) {
    const scheduledFor = schedule.nextRunAt ?? now
    const period = schedulePeriod({ kind: schedule.kind, frequency: schedule.frequency }, scheduledFor)
    const runIdentity = scheduledFor.toISOString().replace(/[^A-Za-z0-9:_-]/g, '')
    const job = await enqueueReportJob({ officeId: schedule.officeId, type: 'GENERATE', origin: 'SCHEDULED', reportKind: schedule.kind === 'DAILY' ? 'daily' : schedule.kind === 'MONTHLY' ? 'monthly' : 'custom', customDefinitionId: schedule.customDefinitionId, scheduleId: schedule.id, idempotencyKey: `schedule:${schedule.id}:${runIdentity}`, periodStart: period.start, periodEnd: period.end, periodLabel: period.label, scheduledFor, payload: { deliverAfter: true } })
    await prisma.reportSchedule.update({ where: { id: schedule.id }, data: { lastAttemptAt: now, lastJobId: job.id, nextRunAt: nextScheduleRun({ frequency: schedule.frequency, localTime: schedule.localTime, weekday: schedule.weekday, monthDay: schedule.monthDay }, scheduledFor) } })
    enqueued += 1
  }
  return enqueued
}

export async function runReportAutomationTick(input: { now?: Date; maxJobs?: number } = {}) {
  const now = input.now ?? new Date()
  const recovered = await recoverExpiredReportJobs(now)
  const scheduled = await enqueueDueSchedules(now)
  const outcomes: string[] = []
  const maxJobs = Math.max(1, Math.min(input.maxJobs ?? 5, 20))
  for (let count = 0; count < maxJobs; count += 1) {
    const job = await claimNextReportJob()
    if (!job) break
    outcomes.push(await processClaimedJob(job))
  }
  return { scheduled, claimed: outcomes.length, outcomes, recovered }
}
