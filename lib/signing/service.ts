import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient, type SigningItem, type SigningAttemptResult } from '@prisma/client'
import { z } from 'zod'
import { recordCriticalEvent } from '../audit/activityEvent'
import { prisma } from '../prisma'
import {
  aggregateJobStatus, assertEligibleVersion, assertItemTransition, assertJobTransition, CreateSigningJobSchema,
  Identifier, LeaseSchema, retryDelayMs, safeSigningError, SigningContextSchema,
  SigningEvidenceSchema, meetsRequestedSigningLevel,
  SigningError, type SigningContext, type SigningLease,
} from './core'

import { lockSigningOffice } from './transaction'
import { signingTrace } from './telemetry'

type Tx = Prisma.TransactionClient
const leaseDuration = z.number().int().min(1_000).max(300_000)
const clearLease = { leaseOwner: null, leaseToken: null, leaseExpiresAt: null }
const terminalJobs = ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED']
export type ValidatedSigningEvidence = z.input<typeof SigningEvidenceSchema>

/** Internal transaction primitive; the caller owns the office lock and commit. */
export async function createSigningJobInTransaction(tx: Tx, context: SigningContext, raw: z.input<typeof CreateSigningJobSchema>) {
  SigningContextSchema.parse(context)
  const input = CreateSigningJobSchema.parse(raw)
  const sourceVersionIds = Array.from(new Set(input.sourceVersionIds)).sort()
  const requestHash = createHash('sha256').update(JSON.stringify({ ...input, sourceVersionIds })).digest('hex')
  const now = await lockSigningOffice(tx, context.officeId)
  const actor = await tx.user.findFirst({ where: { id: context.userId, officeId: context.officeId, isActive: true } })
  if (!actor) throw new SigningError('FORBIDDEN')
  const existing = await tx.signingJob.findUnique({ where: { officeId_idempotencyKey: { officeId: context.officeId, idempotencyKey: input.idempotencyKey } }, include: { items: true } })
  if (existing) {
    if (existing.requestHash !== requestHash) throw new SigningError('IDEMPOTENCY_CONFLICT')
    return existing
  }
  const versions = await tx.documentoVersion.findMany({ where: { id: { in: sourceVersionIds }, officeId: context.officeId }, include: { documento: true, signedSignatures: { select: { id: true } } } })
  if (versions.length !== sourceVersionIds.length) throw new SigningError('NOT_FOUND')
  for (const v of versions) {
    assertEligibleVersion(v, context.officeId)
    if (v.signedSignatures.length) throw new SigningError('INELIGIBLE_SOURCE')
  }
  const alreadySigned = await tx.documentSignature.count({ where: { officeId: context.officeId, sourceVersionId: { in: sourceVersionIds }, signerFingerprint: input.signerFingerprint } })
  if (alreadySigned) throw new SigningError('ALREADY_SIGNED')
  const active = await tx.signingItem.count({ where: { officeId: context.officeId, sourceVersionId: { in: sourceVersionIds }, signerFingerprint: input.signerFingerprint, status: { notIn: ['FAILED', 'CANCELLED'] } } })
  if (active) throw new SigningError('ALREADY_QUEUED')
  const job = await tx.signingJob.create({ data: { officeId: context.officeId, requestedByUserId: context.userId,
    idempotencyKey: input.idempotencyKey, requestHash, signerFingerprint: input.signerFingerprint, requestedLevel: input.requestedLevel } })
  await tx.signingItem.createMany({ data: versions.map(v => ({ jobId: job.id, officeId: context.officeId,
    documentoId: v.documentoId, sourceVersionId: v.id, sourceChecksum: v.checksumSha256,
    signerFingerprint: input.signerFingerprint, maxAttempts: input.maxAttempts, availableAt: now })) })
  await recordCriticalEvent(tx, { officeId: context.officeId, id: context.userId, source: 'INTERNAL' }, {
    eventType: 'signing.requested', module: 'documents', recordType: 'SigningJob', recordId: job.id,
    metadata: { jobId: job.id, status: job.status },
  })
  return tx.signingJob.findUniqueOrThrow({ where: { id: job.id }, include: { items: true } })
}

/** Internal orchestration only; device callers must supply an authentication guard.
 * complete() accepts independently validated evidence. With a reserved artifact,
 * it creates and promotes its version atomically; PDF validation stays outside the transaction.
 */
export function createSigningService(db: PrismaClient = prisma,
  deviceGuard?: (tx: Tx, officeId: number, deviceId: string, now: Date) => Promise<void>) {
  async function transaction<T>(officeId: number, run: (tx: Tx, now: Date) => Promise<T>) {
    z.number().int().positive().parse(officeId)
    return db.$transaction(async tx => {
      // All mutations for an office take this lock first. This also serializes
      // aggregate recalculation, cancellation, retries and idempotent creation.
      // Offices remain independent; the token itself processes PDFs serially.
      return run(tx, await lockSigningOffice(tx, officeId))
    }, { timeout: 30_000, maxWait: 15_000 })
  }

  async function user(tx: Tx, context: SigningContext, admin = false) {
    SigningContextSchema.parse(context)
    const actor = await tx.user.findFirst({ where: { id: context.userId, officeId: context.officeId, isActive: true } })
    if (!actor || (admin && !actor.isOfficeAdmin)) throw new SigningError('FORBIDDEN')
    return actor
  }
  async function device(tx: Tx, officeId: number, deviceId: string) {
    Identifier.parse(deviceId)
    if (deviceGuard) await deviceGuard(tx, officeId, deviceId, await lockSigningOffice(tx, officeId))
    const actor = await tx.signingDevice.findFirst({ where: { id: deviceId, officeId, revokedAt: null, role: { in: ['SIGNER', 'SIGNER_RECEIVER'] } } })
    if (!actor) throw new SigningError('FORBIDDEN')
    return actor
  }
  async function audit(tx: Tx, officeId: number, event: string, metadata: {
    jobId: string; itemId?: string; deviceId?: string; attemptNumber?: number;
    status?: string; errorCode?: string; signatureId?: string; reviewed?: boolean;
    sourceVersionId?: string; signedVersionId?: string; signerFingerprint?: string; sourceChecksum?: string; signedChecksum?: string;
    batchId?: string; remoteSessionId?: string;
  }, userId?: string) {
    await recordCriticalEvent(tx, { officeId, requestId: signingTrace.getStore(), ...(userId ? { user: { id: userId }, actorType: 'USER' as const } : { actorType: 'SYSTEM' as const }), source: 'INTERNAL' }, {
      eventType: event, module: 'documents', recordType: metadata.itemId ? 'SigningItem' : 'SigningJob',
      recordId: metadata.itemId ?? metadata.jobId, metadata,
      result: event === 'signing.failed' ? 'failure' : 'success',
    })
  }
  async function aggregate(tx: Tx, officeId: number, jobId: string, now: Date) {
    const job = await tx.signingJob.findFirstOrThrow({ where: { id: jobId, officeId }, include: { items: { select: { status: true } } } })
    const status = aggregateJobStatus(job.items.map(i => i.status))
    if (job.status !== status) {
      assertJobTransition(job.status, status)
      await tx.signingJob.update({ where: { id: job.id }, data: { status, completedAt: terminalJobs.includes(status) ? now : null } })
      await audit(tx, officeId, 'signing.job_status_changed', { jobId, status })
    }
  }
  async function ownedLease(tx: Tx, lease: SigningLease, now: Date) {
    LeaseSchema.parse(lease)
    await device(tx, lease.officeId, lease.deviceId)
    const item = await tx.signingItem.findFirst({ where: { id: lease.itemId, officeId: lease.officeId,
      leaseOwner: lease.deviceId, leaseToken: lease.leaseToken, leaseExpiresAt: { gt: now }, status: { in: ['CLAIMED', 'SIGNING'] } } })
    if (!item) throw new SigningError('STALE_LEASE')
    return item
  }
  async function endAttempt(tx: Tx, item: SigningItem, result: SigningAttemptResult, now: Date, error?: ReturnType<typeof safeSigningError>) {
    const ended = await tx.signingAttempt.updateMany({ where: { itemId: item.id, officeId: item.officeId, leaseToken: item.leaseToken!, result: 'RUNNING' },
      data: { result, completedAt: now, errorCode: error?.code ?? null, safeError: error?.message ?? null } })
    if (ended.count !== 1) throw new SigningError('INVALID_ATTEMPT')
  }
  async function eligible(tx: Tx, item: Pick<SigningItem, 'officeId' | 'sourceVersionId' | 'sourceChecksum'>) {
    const version = await tx.documentoVersion.findFirst({ where: { id: item.sourceVersionId, officeId: item.officeId }, include: { documento: true, signedSignatures: { select: { id: true } } } })
    if (!version) throw new SigningError('NOT_FOUND')
    assertEligibleVersion(version, item.officeId)
    if (version.checksumSha256 !== item.sourceChecksum || version.signedSignatures.length) throw new SigningError('INELIGIBLE_SOURCE')
    return version
  }
  async function recoverExpired(tx: Tx, officeId: number, now: Date) {
    const expired = await tx.signingItem.findMany({ where: { officeId, status: { in: ['CLAIMED', 'SIGNING'] }, leaseExpiresAt: { lte: now } }, orderBy: { id: 'asc' }, take: 100 })
    for (const item of expired) {
      const status = item.status === 'SIGNING' ? 'WAITING_FOR_OPERATOR' : item.attemptCount >= item.maxAttempts ? 'FAILED' : 'QUEUED'
      assertItemTransition(item.status, status)
      await endAttempt(tx, item, 'LEASE_EXPIRED', now, safeSigningError('LEASE_EXPIRED'))
      await tx.signingItem.update({ where: { id: item.id }, data: { status, ...clearLease,
        completedAt: status === 'FAILED' ? now : null, availableAt: now,
        errorCode: 'LEASE_EXPIRED', safeError: safeSigningError('LEASE_EXPIRED').message } })
      await audit(tx, officeId, 'signing.lease_expired', { jobId: item.jobId, itemId: item.id, deviceId: item.leaseOwner!, attemptNumber: item.attemptCount, status })
      await aggregate(tx, officeId, item.jobId, now)
    }
    return expired.length
  }

  return {
    async createJob(context: SigningContext, raw: z.input<typeof CreateSigningJobSchema>) {
      SigningContextSchema.parse(context)
      return transaction(context.officeId, tx => createSigningJobInTransaction(tx, context, raw))
    },

    async getJob(context: SigningContext, jobId: string) {
      SigningContextSchema.parse(context); Identifier.parse(jobId)
      return transaction(context.officeId, async tx => {
        await user(tx, context)
        const job = await tx.signingJob.findFirst({ where: { id: jobId, officeId: context.officeId }, include: { items: { include: { attempts: true, signature: true } } } })
        if (!job) throw new SigningError('NOT_FOUND')
        return job
      })
    },

    async claim(officeId: number, deviceId: string, durationMs = 60_000) {
      leaseDuration.parse(durationMs)
      return transaction(officeId, async (tx, now) => {
        const signer = await device(tx, officeId, deviceId)
        if (!signer.certificateThumbprint || !['TOKEN_READY', 'CERT_EXPIRING'].includes(signer.health) ||
          (signer.certificateExpiresAt && signer.certificateExpiresAt <= now)) throw new SigningError('DEVICE_NOT_READY')
        await recoverExpired(tx, officeId, now)
        const item = await tx.signingItem.findFirst({ where: { officeId, signerFingerprint: signer.certificateThumbprint,
          status: { in: ['QUEUED', 'RETRY_PENDING'] }, availableAt: { lte: now },
          job: { requestedBy: { isActive: true, officeId } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
        if (!item) return null
        try { await eligible(tx, item) } catch (error) {
          if (!(error instanceof SigningError)) throw error
          assertItemTransition(item.status, 'FAILED')
          await tx.signingItem.update({ where: { id: item.id }, data: { status: 'FAILED', errorCode: 'VALIDATION_FAILED', safeError: 'The source is no longer eligible.', completedAt: now } })
          await audit(tx, officeId, 'signing.failed', { jobId: item.jobId, itemId: item.id, errorCode: 'VALIDATION_FAILED' })
          await aggregate(tx, officeId, item.jobId, now)
          return null
        }
        if (item.attemptCount >= item.maxAttempts) throw new SigningError('ATTEMPTS_EXHAUSTED')
        assertItemTransition(item.status, 'CLAIMED')
        const leaseToken = randomUUID()
        const claimed = await tx.signingItem.update({ where: { id: item.id }, data: { status: 'CLAIMED', leaseOwner: deviceId,
          leaseToken, leaseExpiresAt: new Date(now.getTime() + durationMs), attemptCount: { increment: 1 }, errorCode: null, safeError: null } })
        await tx.signingAttempt.create({ data: { officeId, itemId: item.id, deviceId, attemptNumber: claimed.attemptCount, leaseToken, startedAt: now } })
        await audit(tx, officeId, 'signing.claimed', { jobId: item.jobId, itemId: item.id, deviceId, attemptNumber: claimed.attemptCount })
        await audit(tx, officeId, 'signing.assigned', { jobId: item.jobId, itemId: item.id, deviceId, attemptNumber: claimed.attemptCount, sourceVersionId: item.sourceVersionId, signerFingerprint: item.signerFingerprint })
        await aggregate(tx, officeId, item.jobId, now)
        return claimed
      })
    },

    async renew(lease: SigningLease, durationMs = 60_000) {
      LeaseSchema.parse(lease); leaseDuration.parse(durationMs)
      return transaction(lease.officeId, async (tx, now) => {
        const item = await ownedLease(tx, lease, now)
        const renewed = await tx.signingItem.update({ where: { id: item.id }, data: { leaseExpiresAt: new Date(now.getTime() + durationMs) } })
        await audit(tx, lease.officeId, 'signing.lease_renewed', { jobId: item.jobId, itemId: item.id, deviceId: lease.deviceId })
        return renewed
      })
    },

    async start(lease: SigningLease, locallyApproved = false, batchId?: string, remoteSessionId?: string) {
      LeaseSchema.parse(lease)
      if (batchId) z.string().uuid().parse(batchId)
      if (remoteSessionId) z.string().uuid().parse(remoteSessionId)
      if (remoteSessionId && locallyApproved) throw new SigningError('FORBIDDEN')
      return transaction(lease.officeId, async (tx, now) => {
        const item = await ownedLease(tx, lease, now)
        assertItemTransition(item.status, 'SIGNING')
        await eligible(tx, item)
        const requested = await tx.signingJob.findFirstOrThrow({ where: { id: item.jobId, officeId: lease.officeId }, select: { requestedByUserId: true } })
        await user(tx, { officeId: lease.officeId, userId: requested.requestedByUserId })
        const started = await tx.signingItem.update({ where: { id: item.id }, data: { status: 'SIGNING' } })
        if (remoteSessionId) await audit(tx, lease.officeId, 'signing.remote_authorized', {
          jobId: item.jobId, itemId: item.id, deviceId: lease.deviceId, attemptNumber: item.attemptCount,
          sourceVersionId: item.sourceVersionId, sourceChecksum: item.sourceChecksum, signerFingerprint: item.signerFingerprint,
          remoteSessionId, ...(batchId ? { batchId } : {}) }, requested.requestedByUserId)
        if (locallyApproved) await audit(tx, lease.officeId, 'signing.local_approved', { jobId: item.jobId, itemId: item.id, deviceId: lease.deviceId, attemptNumber: item.attemptCount, sourceVersionId: item.sourceVersionId, signerFingerprint: item.signerFingerprint, ...(batchId ? { batchId } : {}) })
        await audit(tx, lease.officeId, 'signing.started', { jobId: item.jobId, itemId: item.id, deviceId: lease.deviceId, attemptNumber: item.attemptCount })
        return started
      })
    },

    async release(lease: SigningLease) {
      LeaseSchema.parse(lease)
      return transaction(lease.officeId, async (tx, now) => {
        const item = await ownedLease(tx, lease, now)
        if (item.status !== 'CLAIMED') throw new SigningError('INVALID_TRANSITION')
        const status = item.attemptCount >= item.maxAttempts ? 'FAILED' : 'QUEUED'
        assertItemTransition(item.status, status)
        await endAttempt(tx, item, 'RELEASED', now)
        await tx.signingItem.update({ where: { id: item.id }, data: { status, ...clearLease, availableAt: now, completedAt: status === 'FAILED' ? now : null } })
        await audit(tx, lease.officeId, 'signing.released', { jobId: item.jobId, itemId: item.id, deviceId: lease.deviceId, status })
        await aggregate(tx, lease.officeId, item.jobId, now)
      })
    },

    async fail(lease: SigningLease, error: unknown) {
      LeaseSchema.parse(lease)
      const safe = safeSigningError(error)
      return transaction(lease.officeId, async (tx, now) => {
        const item = await ownedLease(tx, lease, now)
        const status = safe.operatorRequired ? 'WAITING_FOR_OPERATOR' : safe.retryable && item.attemptCount < item.maxAttempts ? 'RETRY_PENDING' : 'FAILED'
        assertItemTransition(item.status, status)
        await endAttempt(tx, item, status === 'RETRY_PENDING' ? 'RETRYABLE_FAILURE' : status === 'WAITING_FOR_OPERATOR' ? 'OPERATOR_REQUIRED' : 'PERMANENT_FAILURE', now, safe)
        await tx.signingItem.update({ where: { id: item.id }, data: { status, ...clearLease, errorCode: safe.code, safeError: safe.message,
          availableAt: new Date(now.getTime() + retryDelayMs(item.attemptCount)), completedAt: status === 'FAILED' ? now : null } })
        await audit(tx, lease.officeId, 'signing.failed', { jobId: item.jobId, itemId: item.id, deviceId: lease.deviceId, errorCode: safe.code, status })
        if (status === 'RETRY_PENDING') await audit(tx, lease.officeId, 'signing.retry_scheduled', { jobId: item.jobId, itemId: item.id, deviceId: lease.deviceId, attemptNumber: item.attemptCount, errorCode: safe.code, status })
        await aggregate(tx, lease.officeId, item.jobId, now)
      })
    },

    async complete(lease: SigningLease, raw: ValidatedSigningEvidence,
      artifact?: { id: string; validation: Prisma.InputJsonObject }) {
      LeaseSchema.parse(lease)
      const evidence = SigningEvidenceSchema.parse(raw)
      return transaction(lease.officeId, async (tx, now) => {
        await device(tx, lease.officeId, lease.deviceId)
        const prior = await tx.documentSignature.findFirst({ where: { officeId: lease.officeId, itemId: lease.itemId } })
        if (prior) {
          const attempt = await tx.signingAttempt.findFirst({ where: { officeId: lease.officeId, itemId: lease.itemId, deviceId: lease.deviceId, leaseToken: lease.leaseToken, result: 'SUCCEEDED' } })
          if (!attempt || prior.signedVersionId !== evidence.signedVersionId || prior.signedChecksum !== evidence.signedChecksum || prior.signerFingerprint !== evidence.signerFingerprint || prior.level !== evidence.level) throw new SigningError('RESULT_CONFLICT')
          return prior
        }
        const item = await ownedLease(tx, lease, now)
        assertItemTransition(item.status, 'COMPLETED')
        await eligible(tx, item)
        const job = await tx.signingJob.findUniqueOrThrow({ where: { id: item.jobId } })
        if (evidence.signerFingerprint !== item.signerFingerprint ||
          !meetsRequestedSigningLevel(evidence.level, job.requestedLevel)) throw new SigningError('INVALID_EVIDENCE')
        if (artifact) {
          const upload = await tx.signingArtifact.findFirst({ where: { id: artifact.id, officeId: lease.officeId,
            itemId: item.id, deviceId: lease.deviceId, leaseToken: lease.leaseToken, state: 'PENDING', expiresAt: { gt: now },
            checksumSha256: evidence.signedChecksum } })
          if (!upload) throw new SigningError('INVALID_ARTIFACT')
          const latest = await tx.documentoVersion.aggregate({ where: { documentoId: item.documentoId, officeId: lease.officeId }, _max: { versionNumber: true } })
          await tx.documentoVersion.create({ data: { id: evidence.signedVersionId, officeId: lease.officeId,
            documentoId: item.documentoId, versionNumber: (latest._max.versionNumber ?? 0) + 1,
            storageBucket: upload.storageBucket, storageKey: upload.storageKey, checksumSha256: upload.checksumSha256,
            sizeBytes: upload.sizeBytes, fileName: `${item.documentoId}-firmado.pdf`, mimeType: 'application/pdf' } })
        }
        const output = await tx.documentoVersion.findFirst({ where: { id: evidence.signedVersionId, officeId: lease.officeId,
          documentoId: item.documentoId, deletedAt: null, mimeType: 'application/pdf', checksumSha256: evidence.signedChecksum } })
        if (!output || output.id === item.sourceVersionId || output.sizeBytes <= 0) throw new SigningError('INVALID_EVIDENCE')
        const signature = await tx.documentSignature.create({ data: { officeId: lease.officeId, itemId: item.id, deviceId: lease.deviceId,
          documentoId: item.documentoId, sourceVersionId: item.sourceVersionId, sourceChecksum: item.sourceChecksum, ...evidence } })
        await endAttempt(tx, item, 'SUCCEEDED', now)
        await tx.signingItem.update({ where: { id: item.id }, data: { status: 'COMPLETED', ...clearLease, completedAt: now, errorCode: null, safeError: null } })
        const evidenceMetadata = { jobId: item.jobId, itemId: item.id, deviceId: lease.deviceId, signatureId: signature.id, attemptNumber: item.attemptCount,
          sourceVersionId: item.sourceVersionId, sourceChecksum: item.sourceChecksum, signedVersionId: evidence.signedVersionId,
          signedChecksum: evidence.signedChecksum, signerFingerprint: evidence.signerFingerprint }
        if (artifact) await audit(tx, lease.officeId, 'signing.validated', evidenceMetadata)
        await audit(tx, lease.officeId, 'signing.completed', evidenceMetadata)
        await aggregate(tx, lease.officeId, item.jobId, now)
        if (artifact) {
          const promoted = await tx.documento.updateMany({ where: { id: item.documentoId, officeId: lease.officeId,
            currentVersionId: item.sourceVersionId, voidedAt: null }, data: { currentVersionId: evidence.signedVersionId } })
          if (promoted.count !== 1) throw new SigningError('INELIGIBLE_SOURCE')
          await tx.signingArtifact.update({ where: { id: artifact.id }, data: { state: 'COMMITTED', validation: artifact.validation } })
          // The committed signature is now visible in the shared office catalog.
        }
        return signature
      })
    },

    async retry(context: SigningContext, itemId: string, review?: { attemptCount: number; reviewed: boolean }) {
      SigningContextSchema.parse(context); Identifier.parse(itemId)
      return transaction(context.officeId, async (tx, now) => {
        await user(tx, context, true)
        const item = await tx.signingItem.findFirst({ where: { id: itemId, officeId: context.officeId } })
        if (!item) throw new SigningError('NOT_FOUND')
        if (review && (review.attemptCount !== item.attemptCount || !review.reviewed)) throw new SigningError('RECOVERY_REVIEW_REQUIRED')
        if (review && item.status === 'QUEUED' && await tx.activityEvent.count({ where: {
          officeId: context.officeId, eventType: 'signing.retried', recordType: 'SigningItem', recordId: item.id,
          AND: [{ metadata: { path: ['attemptNumber'], equals: review.attemptCount } }, { metadata: { path: ['reviewed'], equals: true } }],
        } })) return
        assertItemTransition(item.status, 'QUEUED')
        if (!['FAILED', 'WAITING_FOR_OPERATOR'].includes(item.status)) throw new SigningError('INVALID_TRANSITION')
        if (item.attemptCount >= item.maxAttempts) throw new SigningError('ATTEMPTS_EXHAUSTED')
        await eligible(tx, item)
        if (await tx.documentSignature.count({ where: { officeId: context.officeId, sourceVersionId: item.sourceVersionId, signerFingerprint: item.signerFingerprint } })) throw new SigningError('ALREADY_SIGNED')
        if (await tx.signingItem.count({ where: { officeId: context.officeId, sourceVersionId: item.sourceVersionId, signerFingerprint: item.signerFingerprint,
          id: { not: item.id }, status: { notIn: ['FAILED', 'CANCELLED'] } } })) throw new SigningError('ALREADY_QUEUED')
        await tx.signingItem.update({ where: { id: item.id }, data: { status: 'QUEUED', availableAt: now, completedAt: null, errorCode: null, safeError: null } })
        await audit(tx, context.officeId, 'signing.retried', { jobId: item.jobId, itemId: item.id, attemptNumber: item.attemptCount,
          ...(review ? { reviewed: true } : {}) }, context.userId)
        await aggregate(tx, context.officeId, item.jobId, now)
      })
    },

    async cancel(context: SigningContext, itemId: string, guard?: { attemptCount: number; beforeSigningOnly: boolean }) {
      SigningContextSchema.parse(context); Identifier.parse(itemId)
      return transaction(context.officeId, async (tx, now) => {
        await user(tx, context, true)
        const item = await tx.signingItem.findFirst({ where: { id: itemId, officeId: context.officeId } })
        if (!item) throw new SigningError('NOT_FOUND')
        if (item.status === 'CANCELLED') return
        if (guard && (guard.attemptCount !== item.attemptCount || guard.beforeSigningOnly && await tx.activityEvent.count({
          where: { officeId: context.officeId, eventType: 'signing.started', recordType: 'SigningItem', recordId: item.id },
        }))) throw new SigningError('SIGNING_ALREADY_STARTED')
        assertItemTransition(item.status, 'CANCELLED')
        if (item.status === 'CLAIMED') await endAttempt(tx, item, 'CANCELLED', now)
        await tx.signingItem.update({ where: { id: item.id }, data: { status: 'CANCELLED', ...clearLease, completedAt: now } })
        await audit(tx, context.officeId, 'signing.cancelled', { jobId: item.jobId, itemId: item.id }, context.userId)
        await aggregate(tx, context.officeId, item.jobId, now)
      })
    },

    async recoverExpired(context: SigningContext) {
      SigningContextSchema.parse(context)
      return transaction(context.officeId, async (tx, now) => {
        await user(tx, context, true)
        return recoverExpired(tx, context.officeId, now)
      })
    },
    // Internal maintenance only; never exposed through a user/device-supplied office ID.
    async maintainOffice(officeId: number) {
      return transaction(officeId, (tx, now) => recoverExpired(tx, officeId, now))
    },
  }
}
