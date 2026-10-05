import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, fingerprint, hashB } from './signing-support'
import { createSigningService } from '../../lib/signing/service'
import { createSigningCenter } from '../../lib/signing/center'
import { createDeviceService } from '../../lib/signing/devices'
import { maintainSigning } from '../../lib/signing/maintenance'
import { sha256 } from '../../lib/signing/deviceProtocol'

describe.skipIf(process.env.SIGNING_DATABASE_TESTS !== '1')('Phase 10 real database failure injection', () => {
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>
  beforeAll(async () => { sandbox = await createSigningTestDatabase() }, 120000)
  afterAll(async () => { if (sandbox) await sandbox.dispose() }, 60000)
  async function setup(count = 1, maxAttempts = 4) {
    const f = await signingFixture(sandbox.db), docs = await Promise.all(Array.from({ length: count }, () => f.document()))
    const queue = createSigningService(sandbox.db), center = createSigningCenter(sandbox.db)
    const job = await queue.createJob(f.context, { idempotencyKey: randomUUID(), signerFingerprint: fingerprint, sourceVersionIds: docs.map(d => d.source.id), maxAttempts })
    const claim = async () => {
      const item = (await queue.claim(f.office.id, f.device.id, 300000))!
      return { officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! }
    }
    return { ...f, docs, queue, center, job, claim }
  }
  it('injects every error class through actual attempts and preserves requested LT', async () => {
    const codes = ['NETWORK', 'STORAGE', 'TSA_UNAVAILABLE', 'REVOCATION_UNAVAILABLE', 'VALIDATOR_UNAVAILABLE', 'DRIVER_ERROR', 'TOKEN_MISSING', 'PIN_INCORRECT', 'PIN_LOCKED', 'PIN_EXPIRED', 'CERT_EXPIRED', 'CERT_REVOKED', 'VALIDATION_FAILED', 'CHECKSUM_MISMATCH', 'DISK', 'OUTCOME_UNKNOWN']
    const f = await setup(codes.length)
    for (const code of codes) {
      const lease = await f.claim()
      await f.queue.start(lease, true)
      await f.queue.fail(lease, code)
      const item = await sandbox.db.signingItem.findUniqueOrThrow({ where: { id: lease.itemId } })
      const infrastructure = ['NETWORK', 'STORAGE', 'TSA_UNAVAILABLE', 'REVOCATION_UNAVAILABLE', 'VALIDATOR_UNAVAILABLE'].includes(code)
      expect(item.status).toBe(infrastructure ? 'RETRY_PENDING' : ['CERT_EXPIRED', 'CERT_REVOKED', 'VALIDATION_FAILED', 'CHECKSUM_MISMATCH'].includes(code) ? 'FAILED' : 'WAITING_FOR_OPERATOR')
      // Prevent a due injected infrastructure item from being claimed twice in this matrix.
      if (infrastructure) await sandbox.db.signingItem.update({ where: { id: item.id }, data: { availableAt: new Date(Date.now() + 3600000) } })
    }
    expect((await f.queue.getJob(f.context, f.job.id)).requestedLevel).toBe('PADES_LT')
    expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(0)
    expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'signing.local_approved' } })).toBe(codes.length)
  }, 120000)
  it('exhausts infrastructure retries and completes the remaining partial batch once', async () => {
    const f = await setup(2, 2)
    const first = await f.claim()
    await f.queue.fail(first, 'NETWORK')
    await sandbox.db.signingItem.update({ where: { id: first.itemId }, data: { availableAt: new Date(0), createdAt: new Date(0) } })
    const second = await f.claim()
    expect(second.itemId).toBe(first.itemId)
    await f.queue.fail(second, 'TSA_UNAVAILABLE')
    expect((await sandbox.db.signingItem.findUniqueOrThrow({ where: { id: first.itemId } })).status).toBe('FAILED')
    const remaining = await f.claim()
    await f.queue.start(remaining)
    const item = await sandbox.db.signingItem.findUniqueOrThrow({ where: { id: remaining.itemId } })
    const doc = f.docs.find(d => d.source.id === item.sourceVersionId)!
    const evidence = { signedVersionId: doc.output.id, signedChecksum: hashB, signerFingerprint: fingerprint,
      certificateIssuer: 'Synthetic', providerType: 'TEST', level: 'PADES_LT' as const,
      timestampAt: new Date(), revocationCheckedAt: new Date(), validatedAt: new Date() }
    await f.queue.complete(remaining, evidence); await f.queue.complete(remaining, evidence)
    expect((await f.queue.getJob(f.context, f.job.id)).status).toBe('PARTIAL')
    expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(1)
    await expect(f.queue.retry(f.context, remaining.itemId)).rejects.toThrow()
  }, 60000)
  it('makes office-wide alerts independent of date filters and hides diagnostics from members', async () => {
    const f = await setup(), foreign = await setup()
    await sandbox.db.signingDevice.update({ where: { id: f.device.id }, data: { health: 'AGENT_ONLINE_TOKEN_MISSING', certificateExpiresAt: new Date(0) } })
    await sandbox.db.signingDevice.update({ where: { id: f.receiver.id }, data: { healthErrorCode: 'DISK', diskFreeBytes: BigInt(0) } })
    await sandbox.db.signingItem.updateMany({ where: { officeId: f.office.id }, data: { createdAt: new Date(0) } })
    const member = await sandbox.db.user.create({ data: { officeId: f.office.id, officeName: f.office.nombre, email: randomUUID() + '@example.invalid', authUserId: randomUUID() } })
    const view = await f.center.list(f.context, { from: '2099-01-01' })
    expect(view.rows).toHaveLength(0)
    expect(view.alerts!.map(a => a.id)).toEqual(expect.arrayContaining(['AGENT_OFFLINE', 'TOKEN_MISSING', 'CERT_EXPIRED', 'QUEUE_AGE', 'RECEIVER_DISK', 'MAINTENANCE_STALE']))
    const read = await f.center.list({ ...f.context, userId: member.id }, {})
    expect(read.alerts!.every(a => !a.diagnosticCode)).toBe(true)
    expect(read.alerts!.every(a => a.id.startsWith('alert_'))).toBe(true)
    const other = await foreign.center.list(foreign.context, {})
    expect(other.alerts!.some(a => a.id === 'RECEIVER_DISK')).toBe(false)
    await expect(f.center.list({ ...f.context, userId: foreign.user.id }, {})).rejects.toThrow('FORBIDDEN')
  }, 60000)
  it('recovers expired work without an online signer and retains attempts and audit', async () => {
    const f = await setup(2), first = await f.claim(), second = await f.claim()
    await f.queue.start(second)
    const artifact = await sandbox.db.signingArtifact.create({ data: { id: randomUUID(), officeId: f.office.id, itemId: second.itemId,
      deviceId: f.device.id, leaseToken: second.leaseToken, storageBucket: 'test-no-objects', storageKey: randomUUID(),
      checksumSha256: hashB, sizeBytes: 100, expiresAt: new Date(0) } })
    await sandbox.db.deviceSession.create({ data: { officeId: f.office.id, deviceId: f.device.id,
      tokenHash: sha256(randomUUID()), expiresAt: new Date(0) } })
    await sandbox.db.signingItem.updateMany({ where: { id: { in: [first.itemId, second.itemId] } }, data: { leaseExpiresAt: new Date(0) } })
    const result = await maintainSigning(sandbox.db, { storage: { assertPrivate: async () => {}, download: async () => Buffer.alloc(0), upload: async () => {}, remove: async () => {} } })
    expect(result.failures).toBe(0)
    expect((await sandbox.db.signingItem.findUniqueOrThrow({ where: { id: first.itemId } })).status).toBe('QUEUED')
    expect((await sandbox.db.signingItem.findUniqueOrThrow({ where: { id: second.itemId } })).status).toBe('WAITING_FOR_OPERATOR')
    expect(await sandbox.db.signingAttempt.count({ where: { officeId: f.office.id } })).toBe(2)
    expect((await sandbox.db.signingArtifact.findUniqueOrThrow({ where: { id: artifact.id } })).state).toBe('DELETED')
    expect(await sandbox.db.deviceSession.count({ where: { officeId: f.office.id } })).toBe(0)
    expect((await f.center.list(f.context, {})).alerts!.some(a => a.id === 'MAINTENANCE_STALE')).toBe(false)
  }, 120000)
  it('rolls back the start fence if remote-authorization audit cannot persist', async () => {
    const f = await setup(), lease = await f.claim()
    await sandbox.db.$executeRawUnsafe(`CREATE FUNCTION "${sandbox.schema}".reject_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" = 'signing.remote_authorized' THEN RAISE EXCEPTION 'APPROVAL_AUDIT_TEST'; END IF; RETURN NEW; END $$`)
    await sandbox.db.$executeRawUnsafe(`CREATE TRIGGER reject_approval BEFORE INSERT ON "${sandbox.schema}".activity_events FOR EACH ROW EXECUTE FUNCTION "${sandbox.schema}".reject_approval()`)
    try {
      await expect(f.queue.start(lease, false, randomUUID(), randomUUID())).rejects.toThrow('APPROVAL_AUDIT_TEST')
      expect((await sandbox.db.signingItem.findUniqueOrThrow({ where: { id: lease.itemId } })).status).toBe('CLAIMED')
      expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'signing.started' } })).toBe(0)
    } finally { await sandbox.db.$executeRawUnsafe(`DROP TRIGGER reject_approval ON "${sandbox.schema}".activity_events`) }
  }, 60000)
  it('persists local disk/worker failures through heartbeat with strict sanitization', async () => {
    const f = await setup(), service = createDeviceService(sandbox.db), token = randomBytes(32).toString('base64url')
    await sandbox.db.deviceSession.create({ data: { officeId: f.office.id, deviceId: f.receiver.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 600000) } })
    const report = { agentVersion: '0.10.0', role: 'RECEIVER', diskFreeBytes: 0, token: 'NOT_APPLICABLE', certificate: null, lastSuccessfulContactAt: null, operationalError: 'DISK' }
    await service.heartbeat(token, report)
    expect((await f.center.list(f.context, {})).alerts!.some(a => a.id === 'RECEIVER_DISK')).toBe(true)
    await expect(service.heartbeat(token, { ...report, operationalError: 'PIN=SECRET', pin: 'SECRET' })).rejects.toThrow()
    expect(JSON.stringify(await sandbox.db.activityEvent.findMany({ where: { officeId: f.office.id } }))).not.toContain('SECRET')
  }, 60000)
})
