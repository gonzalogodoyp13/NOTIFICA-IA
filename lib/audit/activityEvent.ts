import 'server-only'

import { ActivityActorType, ActivitySource, Prisma } from '@prisma/client'

import { defaultActivityDescription, sanitizeActivityMetadata, type ActivityEventInput } from '@/lib/audit/activityEventCore'
import { validateCatalogEvent } from '@/lib/audit/catalog'
import { debugLog, toSafeErrorMessage } from '@/lib/debugLog'
import { prisma } from '@/lib/prisma'
import { markRequestEventRecorded } from '@/lib/audit/requestState'

type ActivityEventDb = Pick<Prisma.TransactionClient, 'activityEvent'>

export type ActivityContext = {
  id?: string
  user?: { id: string }
  officeId: number
  requestId?: string | null
  actorType?: 'USER' | 'SYSTEM'
  source?: 'WEB' | 'INTERNAL' | 'SYSTEM'
}

export type ContextualActivityEvent = Omit<ActivityEventInput, 'userId' | 'officeId' | 'actorType' | 'source' | 'requestId'>

function normalizeRecordId(value: ActivityEventInput['recordId']) {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

export function activityEventData(input: ActivityEventInput): Prisma.ActivityEventUncheckedCreateInput {
  if (!input.officeId || !input.eventType || !input.module) {
    throw new Error('officeId, eventType and module are required for activity events.')
  }
  const result = input.result ?? 'success'
  const validatedMetadata = validateCatalogEvent(input.eventType, input.module, input.metadata)
  return {
    userId: input.userId ?? null,
    officeId: input.officeId,
    actorType: input.actorType === 'SYSTEM' ? ActivityActorType.SYSTEM : ActivityActorType.USER,
    source: input.source === 'SYSTEM'
      ? ActivitySource.SYSTEM
      : input.source === 'INTERNAL'
        ? ActivitySource.INTERNAL
        : ActivitySource.WEB,
    eventType: input.eventType,
    module: input.module,
    result,
    recordType: input.recordType ?? null,
    recordId: normalizeRecordId(input.recordId),
    rolId: input.rolId ?? null,
    rol: input.rol ?? null,
    shortName: input.shortName ?? null,
    description: input.description?.trim() || defaultActivityDescription({ ...input, result }),
    metadata: sanitizeActivityMetadata(validatedMetadata as Record<string, unknown> | null | undefined) as Prisma.InputJsonValue,
    requestId: input.requestId ?? null,
    eventVersion: input.eventVersion ?? 1,
    deduplicationKey: input.deduplicationKey ?? null,
    occurredAt: input.occurredAt ?? new Date(),
  }
}

export function contextualActivityInput(context: ActivityContext, event: ContextualActivityEvent): ActivityEventInput {
  return {
    ...event,
    userId: context.user?.id ?? context.id ?? null,
    officeId: context.officeId,
    actorType: context.actorType ?? 'USER',
    source: context.source ?? 'WEB',
    requestId: context.requestId ?? null,
  }
}

export async function recordCriticalEvent(
  db: ActivityEventDb,
  context: ActivityContext,
  event: ContextualActivityEvent
) {
  const created = await db.activityEvent.create({ data: activityEventData(contextualActivityInput(context, event)) })
  markRequestEventRecorded()
  return created
}

export async function recordBestEffortEvent(context: ActivityContext, event: ContextualActivityEvent) {
  const input = contextualActivityInput(context, event)
  try {
    const created = await prisma.activityEvent.create({ data: activityEventData(input) })
    markRequestEventRecorded()
    return created
  } catch (error) {
    debugLog('[ActivityEvent] Best-effort event skipped', {
      error: toSafeErrorMessage(error),
      eventType: input.eventType,
      officeId: input.officeId,
      requestId: input.requestId,
    })
    return null
  }
}

/** Compatibility writer for existing callers. New critical code should use recordCriticalEvent. */
export async function recordActivityEvent(input: ActivityEventInput, db: ActivityEventDb = prisma) {
  try {
    const created = await db.activityEvent.create({ data: activityEventData(input) })
    markRequestEventRecorded()
    return created
  } catch (error) {
    debugLog('[ActivityEvent] Log skipped', {
      error: toSafeErrorMessage(error),
      eventType: input.eventType,
      module: input.module,
      userId: input.userId,
      officeId: input.officeId,
    })
    return null
  }
}
