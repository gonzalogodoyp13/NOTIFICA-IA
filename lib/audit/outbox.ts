import 'server-only'

import { ActivityActorType, ActivityOutboxStatus, ActivitySource, Prisma } from '@prisma/client'
import { z } from 'zod'

import { activityEventData, contextualActivityInput, type ActivityContext, type ContextualActivityEvent } from '@/lib/audit/activityEvent'
import { ACTIVITY_MODULES, ACTIVITY_RESULTS, type ActivityEventInput } from '@/lib/audit/activityEventCore'
import { toSafeErrorMessage } from '@/lib/debugLog'
import { prisma } from '@/lib/prisma'
import { markRequestEventRecorded } from '@/lib/audit/requestState'
import { retryDelayMinutes } from '@/lib/audit/outboxCore'

type OutboxDb = Pick<Prisma.TransactionClient, 'activityOutbox'>

const storedEventSchema = z.object({
  eventType: z.string().min(1).max(120),
  module: z.enum(ACTIVITY_MODULES),
  result: z.enum(ACTIVITY_RESULTS).optional(),
  recordType: z.string().max(100).nullable().optional(),
  recordId: z.union([z.string(), z.number()]).nullable().optional(),
  rolId: z.string().nullable().optional(),
  rol: z.string().nullable().optional(),
  shortName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  eventVersion: z.number().int().positive().optional(),
  deduplicationKey: z.string().min(1).max(240),
  occurredAt: z.string().datetime().optional(),
})

export async function enqueueExternalEvent(
  db: OutboxDb,
  context: ActivityContext,
  event: ContextualActivityEvent & { deduplicationKey: string }
) {
  const input = contextualActivityInput(context, event)
  const payload = {
    ...event,
    metadata: activityEventData(input).metadata ?? null,
    occurredAt: (event.occurredAt ?? new Date()).toISOString(),
  }
  storedEventSchema.parse(payload)
  const queued = await db.activityOutbox.create({
    data: {
      officeId: context.officeId,
      userId: context.user?.id ?? context.id ?? null,
      actorType: context.actorType === 'SYSTEM' ? ActivityActorType.SYSTEM : ActivityActorType.USER,
      source: context.source === 'SYSTEM' ? ActivitySource.SYSTEM : context.source === 'INTERNAL' ? ActivitySource.INTERNAL : ActivitySource.WEB,
      eventType: event.eventType,
      payload: payload as Prisma.InputJsonValue,
      requestId: context.requestId ?? null,
      deduplicationKey: event.deduplicationKey,
      nextAttemptAt: new Date(0),
    },
  })
  markRequestEventRecorded()
  return queued
}

export async function processActivityOutbox(limit = 50, outboxId?: string) {
  const targetFilter = outboxId ? Prisma.sql`AND "id" = ${outboxId}` : Prisma.empty
  const rows = await prisma.$queryRaw<Array<{
    id: string
    officeId: number
    userId: string | null
    actorType: ActivityActorType
    source: ActivitySource
    payload: unknown
    requestId: string | null
    deduplicationKey: string
    attempts: number
  }>>(Prisma.sql`
    UPDATE "activity_outbox"
    SET "status" = 'PROCESSING'::"ActivityOutboxStatus",
        "attempts" = "attempts" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" IN (
      SELECT "id"
      FROM "activity_outbox"
      WHERE (
        ("status" = 'PENDING'::"ActivityOutboxStatus" AND "nextAttemptAt" <= CURRENT_TIMESTAMP)
        OR ("status" = 'PROCESSING'::"ActivityOutboxStatus" AND "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
      )
      ${targetFilter}
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${Math.max(1, Math.min(50, limit))}
    )
    RETURNING "id", "officeId", "userId", "actorType", "source", "payload", "requestId", "deduplicationKey", "attempts"
  `)

  let processed = 0
  let dead = 0
  for (const row of rows) {
    try {
      const stored = storedEventSchema.parse(row.payload)
      const eventInput: ActivityEventInput = {
        ...stored,
        officeId: row.officeId,
        userId: row.userId,
        actorType: row.actorType === ActivityActorType.SYSTEM ? 'SYSTEM' : 'USER',
        source: row.source === ActivitySource.SYSTEM ? 'SYSTEM' : row.source === ActivitySource.INTERNAL ? 'INTERNAL' : 'WEB',
        requestId: row.requestId,
        occurredAt: stored.occurredAt ? new Date(stored.occurredAt) : new Date(),
      }
      await prisma.$transaction(async tx => {
        await tx.activityEvent.createMany({ data: [activityEventData(eventInput)], skipDuplicates: true })
        await tx.activityOutbox.update({
          where: { id: row.id },
          data: { status: ActivityOutboxStatus.PROCESSED, processedAt: new Date(), lastError: null },
        })
      })
      processed += 1
    } catch (error) {
      const isDead = row.attempts >= 10
      await prisma.activityOutbox.update({
        where: { id: row.id },
        data: {
          status: isDead ? ActivityOutboxStatus.DEAD : ActivityOutboxStatus.PENDING,
          nextAttemptAt: new Date(Date.now() + retryDelayMinutes(row.attempts) * 60_000),
          lastError: toSafeErrorMessage(error).slice(0, 500),
        },
      })
      if (isDead) dead += 1
    }
  }
  return { claimed: rows.length, processed, dead }
}
