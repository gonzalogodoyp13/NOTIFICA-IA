import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, hashB, fingerprint } from './signing-support'
import type { SigningItem } from '@prisma/client'

vi.mock('server-only', () => ({}))
import { createSigningService } from '../../lib/signing/service'

describe.skipIf(process.env.SIGNING_DATABASE_TESTS !== '1')('signing Phase 2: real concurrent PostgreSQL workers', () => {
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>
  let service: ReturnType<typeof createSigningService>
  beforeAll(async () => { sandbox = await createSigningTestDatabase(); service = createSigningService(sandbox.db) }, 120_000)
  afterAll(async () => { if (sandbox) await sandbox.dispose() }, 60_000)

  async function setup(count = 1, maxAttempts = 4) {
    const f = await signingFixture(sandbox.db)
    const versions = await Promise.all(Array.from({ length: count }, () => f.document()))
    const input = { idempotencyKey: randomUUID(), sourceVersionIds: versions.map(v => v.source.id), signerFingerprint: fingerprint, maxAttempts }
    const job = await service.createJob(f.context, input)
    const claim = () => service.claim(f.office.id, f.device.id)
    const lease = (item: SigningItem) => ({ officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! })
    const evidence = (item: SigningItem) => ({ signedVersionId: versions.find(v => v.source.id === item.sourceVersionId)!.output.id,
      signedChecksum: hashB, signerFingerprint: fingerprint, level: 'PADES_LT' as const,
      certificateIssuer: 'Synthetic test issuer', providerType: 'FAKE_TEST_WORKER',
      timestampAt: new Date(), revocationCheckedAt: new Date(), validatedAt: new Date() })
    return { ...f, versions, input, job, claim, lease, evidence }
  }

  it('runs a fake batch from QUEUED to COMPLETED; repeated completion never duplicates signatures or audit', async () => {
    const f = await setup(2)
    for (let n = 0; n < 2; n++) {
      const item = (await f.claim())!
      await service.start(f.lease(item))
      const signature = await service.complete(f.lease(item), f.evidence(item))
      const again = await service.complete(f.lease(item), f.evidence(item))
      expect(again.id).toBe(signature.id)
      await expect(service.retry(f.context, item.id)).rejects.toThrow('INVALID_TRANSITION')
    }
    const final = await service.getJob(f.context, f.job.id)
    expect(final.status).toBe('COMPLETED')
    expect(final.items.every(i => i.status === 'COMPLETED' && i.leaseOwner === null && i.attempts.length === 1)).toBe(true)
    expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(2)
    expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'signing.completed' } })).toBe(2)
    expect(await f.claim()).toBeNull()
    await expect(service.createJob(f.context, { ...f.input, idempotencyKey: randomUUID() })).rejects.toThrow('ALREADY_SIGNED')
    // Phase 2 must not promote PDFs or create receiver deliveries.
    expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: f.versions[0].doc.id } })).currentVersionId).toBe(f.versions[0].source.id)
    expect(await sandbox.db.documentDelivery.count({ where: { officeId: f.office.id } })).toBe(0)
  }, 60_000)

  it('races independent transactions: one claim wins, and idempotent job creation converges', async () => {
    const f = await setup()
    const second = await sandbox.db.signingDevice.create({ data: { officeId: f.office.id, name: 'Second signer', role: 'SIGNER', health: 'TOKEN_READY', certificateThumbprint: fingerprint } })
    const [a, b] = await Promise.all([f.claim(), service.claim(f.office.id, second.id)])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    const jobs = await Promise.all([service.createJob(f.context, f.input), service.createJob(f.context, f.input)])
    expect(jobs[0].id).toBe(jobs[1].id)
    expect(await sandbox.db.signingAttempt.count({ where: { officeId: f.office.id } })).toBe(1)
    await expect(service.createJob(f.context, { ...f.input, maxAttempts: 3 })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    const extra = await f.document()
    const freshInput = { ...f.input, idempotencyKey: randomUUID(), sourceVersionIds: [extra.source.id] }
    const created = await Promise.all([service.createJob(f.context, freshInput), service.createJob(f.context, freshInput)])
    expect(created[0].id).toBe(created[1].id)
    expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(2)
  }, 60_000)

  it('reassigns expired claims and rejects every mutation by the old lease even on the same device', async () => {
    const f = await setup()
    const old = (await f.claim())!
    await sandbox.db.signingItem.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(0) } })
    const fresh = (await f.claim())!
    expect(fresh.id).toBe(old.id)
    expect(fresh.leaseToken).not.toBe(old.leaseToken)
    for (const call of [() => service.renew(f.lease(old)), () => service.release(f.lease(old)), () => service.start(f.lease(old)),
      () => service.fail(f.lease(old), 'NETWORK'), () => service.complete(f.lease(old), f.evidence(old))]) {
      await expect(call()).rejects.toThrow('STALE_LEASE')
    }
    await service.renew(f.lease(fresh))
    await service.start(f.lease(fresh))
    await service.complete(f.lease(fresh), f.evidence(fresh))
    const attempts = await sandbox.db.signingAttempt.findMany({ where: { itemId: old.id }, orderBy: { attemptNumber: 'asc' } })
    expect(attempts.map(a => a.result)).toEqual(['LEASE_EXPIRED', 'SUCCEEDED'])
  }, 60_000)

  it('holds uncertain in-flight signing for operator recovery and never silently signs again', async () => {
    const f = await setup()
    const item = (await f.claim())!
    await service.start(f.lease(item))
    await sandbox.db.signingItem.update({ where: { id: item.id }, data: { leaseExpiresAt: new Date(0) } })
    expect(await service.recoverExpired(f.context)).toBe(1)
    expect(await f.claim()).toBeNull()
    expect((await service.getJob(f.context, f.job.id)).status).toBe('WAITING_FOR_OPERATOR')
    await expect(service.complete(f.lease(item), f.evidence(item))).rejects.toThrow('STALE_LEASE')
    await service.retry(f.context, item.id)
    expect((await f.claim())?.attemptCount).toBe(2)
  }, 60_000)

  it('backs off retryable failures, then completes remaining items in a partial batch', async () => {
    const f = await setup(2)
    const first = (await f.claim())!
    await service.start(f.lease(first)); await service.complete(f.lease(first), f.evidence(first))
    const second = (await f.claim())!
    await service.fail(f.lease(second), 'VALIDATION_FAILED')
    expect((await service.getJob(f.context, f.job.id)).status).toBe('PARTIAL')
    await service.retry(f.context, second.id)
    const retried = (await f.claim())!
    await service.fail(f.lease(retried), 'TSA_UNAVAILABLE')
    expect(await f.claim()).toBeNull()
    const pending = await sandbox.db.signingItem.findUniqueOrThrow({ where: { id: second.id } })
    expect(pending.status).toBe('RETRY_PENDING')
    expect(pending.availableAt.getTime()).toBeGreaterThan(pending.updatedAt.getTime())
    await sandbox.db.signingItem.update({ where: { id: second.id }, data: { availableAt: new Date(0) } })
    const final = (await f.claim())!
    await service.start(f.lease(final)); await service.complete(f.lease(final), f.evidence(final))
    expect((await service.getJob(f.context, f.job.id)).status).toBe('COMPLETED')
    expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(2)
  }, 60_000)

  it('requires operator action after a wrong PIN, sanitizes raw errors, and caps attempts', async () => {
    const f = await setup(1, 2)
    const item = (await f.claim())!
    await service.fail(f.lease(item), 'PIN_INCORRECT')
    expect(await f.claim()).toBeNull()
    expect((await service.getJob(f.context, f.job.id)).status).toBe('WAITING_FOR_OPERATOR')
    await service.retry(f.context, item.id)
    const retry = (await f.claim())!
    await service.fail(f.lease(retry), new Error('PIN=123456 password=secret'))
    const final = await service.getJob(f.context, f.job.id)
    expect(final.status).toBe('FAILED')
    expect(final.items[0].errorCode).toBe('UNKNOWN')
    const audit = await sandbox.db.activityEvent.findMany({ where: { officeId: f.office.id } })
    expect(JSON.stringify({ final, audit })).not.toMatch(/123456|password=secret/)
    await expect(service.retry(f.context, item.id)).rejects.toThrow('ATTEMPTS_EXHAUSTED')
  }, 60_000)

  it('releases claimed work, cancels pending/claimed work, and refuses cancellation after signing starts', async () => {
    const f = await setup(2)
    const first = (await f.claim())!
    await service.release(f.lease(first))
    await expect(service.start(f.lease(first))).rejects.toThrow('STALE_LEASE')
    const again = (await f.claim())!
    await service.cancel(f.context, again.id)
    await service.cancel(f.context, again.id)
    await expect(service.start(f.lease(again))).rejects.toThrow('STALE_LEASE')
    const other = (await f.claim())!
    await service.start(f.lease(other))
    await expect(service.cancel(f.context, other.id)).rejects.toThrow('INVALID_TRANSITION')
    await expect(service.release(f.lease(other))).rejects.toThrow('INVALID_TRANSITION')
    await service.complete(f.lease(other), f.evidence(other))
    expect((await service.getJob(f.context, f.job.id)).status).toBe('PARTIAL')
  }, 60_000)

  it('enforces office, user, role and revoked-device boundaries on every worker operation', async () => {
    const f = await setup()
    const other = await signingFixture(sandbox.db)
    await expect(service.getJob(other.context, f.job.id)).rejects.toThrow('NOT_FOUND')
    await expect(service.getJob({ ...f.context, userId: other.user.id }, f.job.id)).rejects.toThrow('FORBIDDEN')
    await expect(service.createJob(other.context, f.input)).rejects.toThrow('NOT_FOUND')
    await expect(service.cancel(other.context, f.job.items[0].id)).rejects.toThrow('NOT_FOUND')
    await expect(service.retry(other.context, f.job.items[0].id)).rejects.toThrow('NOT_FOUND')
    await expect(service.claim(f.office.id, f.receiver.id)).rejects.toThrow('FORBIDDEN')
    await expect(service.claim(other.office.id, f.device.id)).rejects.toThrow('FORBIDDEN')
    const item = (await f.claim())!
    await sandbox.db.signingDevice.update({ where: { id: f.device.id }, data: { revokedAt: new Date() } })
    for (const call of [() => f.claim(), () => service.start(f.lease(item)), () => service.renew(f.lease(item)),
      () => service.release(f.lease(item)), () => service.fail(f.lease(item), 'NETWORK'), () => service.complete(f.lease(item), f.evidence(item))]) {
      await expect(call()).rejects.toThrow('FORBIDDEN')
    }
    await sandbox.db.user.update({ where: { id: f.user.id }, data: { isActive: false } })
    await expect(service.getJob(f.context, f.job.id)).rejects.toThrow('FORBIDDEN')
  }, 60_000)

  it('rejects bad evidence without success side effects; duplicate completions converge under concurrency', async () => {
    const f = await setup()
    const item = (await f.claim())!
    await expect(service.complete(f.lease(item), f.evidence(item))).rejects.toThrow('INVALID_TRANSITION')
    await service.start(f.lease(item))
    await expect(service.complete(f.lease(item), { ...f.evidence(item), signedChecksum: 'e'.repeat(64) })).rejects.toThrow('INVALID_EVIDENCE')
    await expect(service.complete(f.lease(item), { ...f.evidence(item), signerFingerprint: 'f'.repeat(64) })).rejects.toThrow('INVALID_EVIDENCE')
    const other = await f.document()
    await expect(service.complete(f.lease(item), { ...f.evidence(item), signedVersionId: other.output.id })).rejects.toThrow('INVALID_EVIDENCE')
    expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(0)
    const results = await Promise.all([service.complete(f.lease(item), f.evidence(item)), service.complete(f.lease(item), f.evidence(item))])
    expect(results[0].id).toBe(results[1].id)
    await expect(service.complete({ ...f.lease(item), leaseToken: randomUUID() }, f.evidence(item))).rejects.toThrow('RESULT_CONFLICT')
  }, 60_000)

  it('rolls back a job or worker transition if canonical audit persistence fails', async () => {
    const f = await setup()
    const failingDb = sandbox.db.$extends({ query: { activityEvent: { async create() { throw new Error('Synthetic audit failure') } } } })
    const failing = createSigningService(failingDb as unknown as typeof sandbox.db)
    const extra = await f.document()
    await expect(failing.createJob(f.context, { ...f.input, idempotencyKey: randomUUID(), sourceVersionIds: [extra.source.id] })).rejects.toThrow('Synthetic audit failure')
    expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(1)
    await expect(failing.claim(f.office.id, f.device.id)).rejects.toThrow('Synthetic audit failure')
    expect(await sandbox.db.signingAttempt.count({ where: { officeId: f.office.id } })).toBe(0)
    expect((await service.getJob(f.context, f.job.id)).status).toBe('QUEUED')
  }, 60_000)

  it('rejects voided or superseded sources both at enqueue and before processing', async () => {
    const f = await setup()
    await sandbox.db.documento.update({ where: { id: f.versions[0].doc.id }, data: { voidedAt: new Date() } })
    expect(await f.claim()).toBeNull()
    expect((await service.getJob(f.context, f.job.id)).status).toBe('FAILED')
    const extra = await f.document()
    await sandbox.db.documento.update({ where: { id: extra.doc.id }, data: { currentVersionId: extra.output.id } })
    await expect(service.createJob(f.context, { ...f.input, idempotencyKey: randomUUID(), sourceVersionIds: [extra.source.id] })).rejects.toThrow('INELIGIBLE_SOURCE')
  }, 60_000)
})
