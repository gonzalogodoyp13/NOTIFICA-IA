import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, fingerprint, hashA, hashB } from './signing-support'
vi.mock('server-only', () => ({}))
import { createSigningCenter } from '../../lib/signing/center'
import { createSigningService } from '../../lib/signing/service'
import { createDeviceService } from '../../lib/signing/devices'

describe.skipIf(process.env.SIGNING_DATABASE_TESTS !== '1')('Phase 8 office control center', () => {
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>
  beforeAll(async () => { sandbox = await createSigningTestDatabase() }, 120000)
  afterAll(async () => { if (sandbox) await sandbox.dispose() }, 60000)
  async function setup() {
    const f = await signingFixture(sandbox.db), center = createSigningCenter(sandbox.db), queue = createSigningService(sandbox.db)
    const v = await f.document()
    const type = await sandbox.db.diligenciaTipo.create({ data: { officeId: f.office.id, nombre: 'Phase 8 execution' } })
    const diligence = await sandbox.db.diligencia.create({ data: { rolId: f.rol.id, tipoId: type.id, fecha: new Date('2026-01-01T12:00:00Z') } })
    const notification = await sandbox.db.notificacion.create({ data: { id: randomUUID(), diligenciaId: diligence.id, meta: { ejecucion: { fecha: '2026-09-10' } } } })
    await sandbox.db.documento.update({ where: { id: v.doc.id }, data: { notificacionId: notification.id, createdAt: new Date('2026-02-01') } })
    await sandbox.db.signingDevice.update({ where: { id: f.device.id }, data: { certificateExpiresAt: new Date(Date.now() + 86400000), lastHeartbeatAt: new Date() } })
    const input = { action: 'queue' as const, signerFingerprint: fingerprint, requestedLevel: 'PADES_B' as const,
      sources: [{ versionId: v.source.id, checksum: hashA }] }
    return { ...f, ...v, center, queue, input, notification, diligence }
  }
  it('filters by notification execution date and paginates after filtering, with metadata only', async () => {
    const f = await setup()
    const result = await f.center.list(f.context, { from: '2026-09-10', to: '2026-09-10', status: 'ELIGIBLE', pageSize: 1 })
    expect(result.total).toBe(1); expect(result.rows[0].businessDate).toBe('2026-09-10')
    expect((await f.center.list(f.context, { from: '2026-02-01', to: '2026-02-01' })).total).toBe(0)
    expect(JSON.stringify(result)).not.toContain(f.source.storageKey)
    expect(result.rows[0].canRetry).toBe(false)
  }, 60000)
  it('enforces membership/admin boundaries and hides diagnostics from nonadmins', async () => {
    const f = await setup(), other = await setup()
    await expect(f.center.list({ ...f.context, officeId: other.office.id }, {})).rejects.toThrow('FORBIDDEN')
    await expect(f.center.mutate(f.context, { ...f.input, sources: [{ versionId: other.source.id, checksum: hashA }] })).rejects.toThrow('SOURCE_CHANGED')
    await f.center.mutate(f.context, f.input)
    const item = (await f.queue.claim(f.office.id, f.device.id))!
    await f.queue.fail({ officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! }, 'PIN_INCORRECT')
    expect((await f.center.list(f.context, {})).rows[0].diagnosticCode).toBe('PIN_INCORRECT')
    await sandbox.db.user.update({ where: { id: f.user.id }, data: { isOfficeAdmin: false } })
    const view = await f.center.list(f.context, {})
    expect(view.canManage).toBe(false); expect(view.rows[0].diagnosticCode).toBeUndefined()
    expect(view.rows[0].canRetry).toBe(false)
    await expect(f.center.mutate(f.context, f.input)).rejects.toThrow('FORBIDDEN')
  }, 60000)
  it('creates one manual batch under concurrent and lost-response replays', async () => {
    const f = await setup()
    const results = await Promise.all([f.center.mutate(f.context, f.input), f.center.mutate(f.context, f.input)])
    expect(results[0]).toHaveProperty('jobId'); expect(results[1]).toHaveProperty('jobId', 'jobId' in results[0] ? results[0].jobId : '')
    expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(1)
    const view = await f.center.list(f.context, {})
    expect(view.rows[0].origin).toBe('MANUAL'); expect(view.rows[0].status).toBe('QUEUED')
    await expect(f.center.mutate(f.context, { ...f.input, requestedLevel: 'PADES_LT' })).rejects.toThrow('USE_EXISTING_JOB')
  }, 60000)
  it('rejects changed checksums, revoked signers and voided notification sources', async () => {
    const f = await setup()
    await expect(f.center.mutate(f.context, { ...f.input, sources: [{ versionId: f.source.id, checksum: hashB }] })).rejects.toThrow('SOURCE_CHANGED')
    await sandbox.db.notificacion.update({ where: { id: f.notification.id }, data: { voidedAt: new Date() } })
    await expect(f.center.mutate(f.context, f.input)).rejects.toThrow('SOURCE_CHANGED')
    await sandbox.db.signingDevice.update({ where: { id: f.device.id }, data: { revokedAt: new Date() } })
    await expect(f.center.mutate(f.context, f.input)).rejects.toThrow('SIGNER_UNAVAILABLE')
    expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(0)
  }, 60000)
  it('prevents cancellation after signing starts, including failed/waiting work', async () => {
    const f = await setup(); await f.center.mutate(f.context, f.input)
    const item = (await f.queue.claim(f.office.id, f.device.id))!
    const lease = { officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! }
    await f.queue.start(lease)
    await expect(f.center.mutate(f.context, { action: 'cancel', itemId: item.id, attemptCount: 1 })).rejects.toThrow('SIGNING_ALREADY_STARTED')
    await f.queue.fail(lease, 'OUTCOME_UNKNOWN')
    expect((await f.center.list(f.context, {})).rows[0]).toMatchObject({ canCancel: false, canRetry: true, started: true })
    await expect(f.center.mutate(f.context, { action: 'cancel', itemId: item.id, attemptCount: 1 })).rejects.toThrow('SIGNING_ALREADY_STARTED')
  }, 60000)
  it('cancels only an unchanged pre-signing assignment and repeats safely', async () => {
    const f = await setup(); await f.center.mutate(f.context, f.input)
    const item = (await f.queue.claim(f.office.id, f.device.id))!
    await expect(f.center.mutate(f.context, { action: 'cancel', itemId: item.id, attemptCount: 0 })).rejects.toThrow('SIGNING_ALREADY_STARTED')
    const action = { action: 'cancel', itemId: item.id, attemptCount: 1 }
    await f.center.mutate(f.context, action); await f.center.mutate(f.context, action)
    expect((await f.center.list(f.context, {})).rows[0].status).toBe('CANCELLED')
    await expect(f.queue.start({ officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! })).rejects.toThrow('STALE_LEASE')
  }, 60000)
  it('requires reviewed retry, rejects stale review, and releases the old agent journal only after review', async () => {
    const f = await setup(); await f.center.mutate(f.context, f.input)
    const item = (await f.queue.claim(f.office.id, f.device.id))!
    const lease = { officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! }
    const token = randomBytes(32).toString('base64url'), device = createDeviceService(sandbox.db)
    await sandbox.db.deviceSession.create({ data: { officeId: f.office.id, deviceId: f.device.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 300000) } })
    const remoteLease = { itemId: item.id, leaseToken: item.leaseToken! }
    await f.queue.start(lease); await f.queue.fail(lease, 'OUTCOME_UNKNOWN')
    expect(await device.recovery(token, remoteLease)).toEqual({ released: false })
    await expect(f.center.mutate(f.context, { action: 'retry', itemId: item.id, attemptCount: 0, reviewed: true })).rejects.toThrow('RECOVERY_REVIEW_REQUIRED')
    const retry = { action: 'retry', itemId: item.id, attemptCount: 1, reviewed: true }
    await f.center.mutate(f.context, retry); await f.center.mutate(f.context, retry)
    expect(await device.recovery(token, remoteLease)).toEqual({ released: true })
    expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'signing.retried' } })).toBe(1)
    const next = (await f.queue.claim(f.office.id, f.device.id))!
    expect(next.leaseToken).not.toBe(item.leaseToken)
    await expect(f.center.mutate(f.context, retry)).rejects.toThrow('RECOVERY_REVIEW_REQUIRED')
  }, 60000)
  it('never retries a completed signature into a duplicate and keeps automatic jobs visible', async () => {
    const f = await setup()
    await f.queue.createJob(f.context, { idempotencyKey: 'completion_test', sourceVersionIds: [f.source.id], signerFingerprint: fingerprint, requestedLevel: 'PADES_B' })
    const item = (await f.queue.claim(f.office.id, f.device.id))!
    const lease = { officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! }
    await f.queue.start(lease)
    await f.queue.complete(lease, { signedVersionId: f.output.id, signedChecksum: hashB, signerFingerprint: fingerprint,
      certificateIssuer: 'Synthetic', providerType: 'TEST', level: 'PADES_B', revocationCheckedAt: new Date(), validatedAt: new Date() })
    const view = await f.center.list(f.context, {})
    expect(view.rows[0]).toMatchObject({ status: 'COMPLETED', canRetry: false, canCancel: false, origin: 'AUTOMATIC' })
    await expect(f.center.mutate(f.context, { action: 'retry', itemId: item.id, attemptCount: 1, reviewed: true })).rejects.toThrow('INVALID_TRANSITION')
    expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(1)
  }, 60000)
  it('rolls back the entire manual batch when its audit cannot commit', async () => {
    const f = await setup()
    await sandbox.db.$executeRawUnsafe(`CREATE FUNCTION "${sandbox.schema}".reject_manual_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" = 'signing.requested' THEN RAISE EXCEPTION 'MANUAL_AUDIT_FAILURE'; END IF; RETURN NEW; END $$`)
    await sandbox.db.$executeRawUnsafe(`CREATE TRIGGER reject_manual_audit BEFORE INSERT ON "${sandbox.schema}".activity_events FOR EACH ROW EXECUTE FUNCTION "${sandbox.schema}".reject_manual_audit()`)
    try {
      await expect(f.center.mutate(f.context, f.input)).rejects.toThrow('MANUAL_AUDIT_FAILURE')
      expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(0)
      expect(await sandbox.db.signingItem.count({ where: { officeId: f.office.id } })).toBe(0)
    } finally { await sandbox.db.$executeRawUnsafe(`DROP TRIGGER reject_manual_audit ON "${sandbox.schema}".activity_events`) }
  }, 60000)
  it('does not leak execution metadata through malformed cross-office notification links', async () => {
    const f = await setup(), foreign = await setup()
    await sandbox.db.notificacion.update({ where: { id: foreign.notification.id }, data: { meta: { ejecucion: { fecha: '2024-04-01' } } } })
    await sandbox.db.documento.update({ where: { id: f.doc.id }, data: { notificacionId: foreign.notification.id } })
    const view = await f.center.list(f.context, {})
    expect(view.rows[0].businessDate).toBeNull()
    expect(view.rows[0].status).toBe('EXCLUDED')
    expect(JSON.stringify(view)).not.toContain(foreign.notification.id)
    expect(JSON.stringify(view)).not.toContain('2024-04-01')
    await expect(f.center.mutate(f.context, f.input)).rejects.toThrow('SOURCE_CHANGED')
  }, 60000)
})
