import 'server-only'

import { z } from 'zod'

import { ApiError } from '@/lib/api/server'
import { recordBestEffortEvent } from '@/lib/audit/activityEvent'
import { prisma } from '@/lib/prisma'
import { deriveScheduleHealth, nextScheduleRun, schedulePeriod } from './automationCore'
import { enqueueReportJob } from './jobs'
import { configuredRecipients } from './recipients'

export const ScheduleUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  weekday: z.number().int().min(1).max(7).nullable().optional(),
  monthDay: z.number().int().min(1).max(28).nullable().optional(),
  latenessThresholdMinutes: z.number().int().min(5).max(1440).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Debes enviar al menos un cambio.')

export async function ensureStandardSchedules(officeId: number) {
  await Promise.all([
    prisma.reportSchedule.upsert({
      where: { officeId_identityKey: { officeId, identityKey: 'daily' } },
      create: { officeId, kind: 'DAILY', identityKey: 'daily', frequency: 'DAILY', localTime: '07:00', enabled: false, latenessThresholdMinutes: 60 },
      update: {},
    }),
    prisma.reportSchedule.upsert({
      where: { officeId_identityKey: { officeId, identityKey: 'monthly' } },
      create: { officeId, kind: 'MONTHLY', identityKey: 'monthly', frequency: 'MONTHLY', localTime: '07:15', monthDay: 1, enabled: false, latenessThresholdMinutes: 60 },
      update: {},
    }),
  ])
}

async function scheduleRecipientCount(schedule: { officeId: number; kind: string; customDefinitionId: string | null }) {
  return (await configuredRecipients({ officeId: schedule.officeId, kind: schedule.kind === 'DAILY' ? 'daily' : schedule.kind === 'MONTHLY' ? 'monthly' : 'custom', definitionId: schedule.customDefinitionId })).length
}

export async function listReportSchedules(officeId: number, now = new Date()) {
  await ensureStandardSchedules(officeId)
  const schedules = await prisma.reportSchedule.findMany({
    where: { officeId },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    include: { customDefinition: { select: { id: true, name: true, status: true } }, lastJob: { select: { id: true, status: true, leaseExpiresAt: true } } },
  })
  return Promise.all(schedules.map(async schedule => {
    const recipientCount = await scheduleRecipientCount(schedule)
    return { ...schedule, recipientCount, health: deriveScheduleHealth({ ...schedule, hasRecipients: recipientCount > 0 }) }
  }))
}

export async function updateReportSchedule(input: { officeId: number; scheduleId: string; actorUserId: string; requestId?: string; value: unknown }) {
  const value = ScheduleUpdateSchema.parse(input.value)
  const schedule = await prisma.reportSchedule.findFirst({ where: { id: input.scheduleId, officeId: input.officeId }, include: { customDefinition: { select: { status: true } } } })
  if (!schedule) throw new ApiError('NOT_FOUND', 'La programación no existe.', 404)
  if (schedule.customDefinition?.status === 'ARCHIVED') throw new ApiError('CONFLICT', 'No se puede activar una definición archivada.', 409)
  const localTime = value.localTime ?? schedule.localTime
  const weekday = schedule.frequency === 'WEEKLY' ? value.weekday ?? schedule.weekday ?? 1 : null
  const monthDay = schedule.frequency === 'MONTHLY' ? value.monthDay ?? schedule.monthDay ?? 1 : null
  const enabled = value.enabled ?? schedule.enabled
  const nextRunAt = enabled ? nextScheduleRun({ frequency: schedule.frequency, localTime, weekday, monthDay }) : null
  const updated = await prisma.reportSchedule.update({ where: { id: schedule.id }, data: {
    enabled,
    localTime,
    weekday,
    monthDay,
    latenessThresholdMinutes: value.latenessThresholdMinutes ?? schedule.latenessThresholdMinutes,
    nextRunAt,
    updatedByUserId: input.actorUserId,
  } })
  const recipientCount = await scheduleRecipientCount(updated)
  await recordBestEffortEvent({ id: input.actorUserId, officeId: input.officeId, requestId: input.requestId }, {
    eventType: 'report.schedule.changed', module: 'reports', result: 'success', recordType: 'ReportSchedule', recordId: schedule.id,
    description: 'Programación de reportes actualizada.', metadata: { enabled, frequency: updated.frequency, nextRunAt: nextRunAt?.toISOString() ?? null, recipientCount },
  })
  return { ...updated, recipientCount, health: deriveScheduleHealth({ ...updated, lastJob: null, hasRecipients: recipientCount > 0 }) }
}

export async function runScheduleNow(input: { officeId: number; scheduleId: string; actorUserId: string; idempotencyKey: string; requestId?: string }) {
  const schedule = await prisma.reportSchedule.findFirst({ where: { id: input.scheduleId, officeId: input.officeId }, include: { customDefinition: { select: { status: true } } } })
  if (!schedule) throw new ApiError('NOT_FOUND', 'La programación no existe.', 404)
  if (schedule.customDefinition?.status === 'ARCHIVED') throw new ApiError('CONFLICT', 'La definición está archivada.', 409)
  const now = new Date()
  const period = schedulePeriod({ kind: schedule.kind, frequency: schedule.frequency }, now)
  const job = await enqueueReportJob({
    officeId: schedule.officeId,
    type: 'GENERATE',
    origin: 'MANUAL',
    reportKind: schedule.kind === 'DAILY' ? 'daily' : schedule.kind === 'MONTHLY' ? 'monthly' : 'custom',
    customDefinitionId: schedule.customDefinitionId,
    scheduleId: schedule.id,
    requestedByUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    periodStart: period.start,
    periodEnd: period.end,
    periodLabel: period.label,
    payload: { deliverAfter: true },
  })
  await prisma.reportSchedule.update({ where: { id: schedule.id }, data: { lastAttemptAt: now, lastJobId: job.id, updatedByUserId: input.actorUserId } })
  await recordBestEffortEvent({ id: input.actorUserId, officeId: input.officeId, requestId: input.requestId }, {
    eventType: 'report.schedule.run_now', module: 'reports', result: 'success', recordType: 'ReportSchedule', recordId: schedule.id,
    description: 'Ejecución inmediata de programación encolada.', metadata: { jobId: job.id, period: period.label },
  })
  return job
}
