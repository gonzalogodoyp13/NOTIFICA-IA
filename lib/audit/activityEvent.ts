import 'server-only'

import { Prisma } from '@prisma/client'

import { defaultActivityDescription, sanitizeActivityMetadata, type ActivityEventInput } from '@/lib/audit/activityEventCore'
import { debugLog, toSafeErrorMessage } from '@/lib/debugLog'
import { prismaNoMiddleware } from '@/lib/prismaNoMiddleware'

type ActivityEventDb = {
  activityEvent: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>
  }
}

function normalizeRecordId(value: ActivityEventInput['recordId']) {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

export async function recordActivityEvent(input: ActivityEventInput, db: ActivityEventDb = prismaNoMiddleware) {
  try {
    if (!input.userId || !input.officeId || !input.eventType || !input.module) {
      return null
    }

    const result = input.result ?? 'success'
    const description = input.description?.trim() || defaultActivityDescription({ ...input, result })
    const metadata = sanitizeActivityMetadata(input.metadata)

    return await db.activityEvent.create({
      data: {
        userId: input.userId,
        officeId: input.officeId,
        eventType: input.eventType,
        module: input.module,
        result,
        recordType: input.recordType ?? null,
        recordId: normalizeRecordId(input.recordId),
        rolId: input.rolId ?? null,
        rol: input.rol ?? null,
        shortName: input.shortName ?? null,
        description,
        metadata: metadata as Prisma.InputJsonValue,
        occurredAt: input.occurredAt ?? new Date(),
      },
    })
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
