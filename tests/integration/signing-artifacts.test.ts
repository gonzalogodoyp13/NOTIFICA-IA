import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, fingerprint } from './signing-support'
vi.mock('server-only', () => ({}))
import { createDeviceService } from '../../lib/signing/devices'
import { createSigningService } from '../../lib/signing/service'
import { createDeviceHandler } from '../../lib/signing/deviceHttp'
import { type SigningStorage } from '../../lib/signing/artifacts'
import { type PdfValidator } from '../../lib/signing/pdfValidator'
import { SigningError } from '../../lib/signing/core'
import { createSigningCenter } from '../../lib/signing/center'
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const sourceBytes = Buffer.from('%PDF-1.7\nsynthetic source for orchestration tests only\n%%EOF')
const signedBytes = Buffer.concat([sourceBytes, Buffer.from('\nsynthetic signature')])

describe.skipIf(process.env.SIGNING_DATABASE_TESTS !== '1')('Phase 7 artifact orchestration with real PostgreSQL', () => {
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>
  beforeAll(async () => { sandbox = await createSigningTestDatabase() }, 120_000)
  afterAll(async () => { if (sandbox) await sandbox.dispose() }, 60_000)
  async function setup() {
    const f = await signingFixture(sandbox.db)
    const v = await f.document()
    await sandbox.db.documentoVersion.update({ where: { id: v.source.id }, data: { checksumSha256: hash(sourceBytes), sizeBytes: sourceBytes.length } })
    const token = randomBytes(32).toString('base64url')
    await sandbox.db.deviceSession.create({ data: { officeId: f.office.id, deviceId: f.device.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 600_000) } })
    await sandbox.db.signingDevice.update({ where: { id: f.device.id }, data: { lastHeartbeatAt: new Date() } })
    const objects = new Map<string, Buffer>([[v.source.storageKey, sourceBytes]])
    const storage: SigningStorage = {
      assertPrivate: vi.fn(async () => {}),
      download: vi.fn(async (_bucket, key) => { const data = objects.get(key); if (!data) throw Error('MISSING'); return data }),
      upload: vi.fn(async (_bucket, key, bytes) => { if (objects.has(key)) throw Error('COLLISION'); objects.set(key, Buffer.from(bytes)) }),
      remove: vi.fn(async (_bucket, key) => { objects.delete(key) }),
    }
    // This validator is only for transaction fault injection. Real cryptography
    // is tested independently with the server process and real signed fixtures.
    const validator = vi.fn<PdfValidator>(async r => ({ signerFingerprint: r.signerFingerprint,
      certificateIssuer: 'Synthetic test issuer', providerType: 'PYHANKO_0_37_SERVER', level: r.requestedLevel,
      timestampAt: new Date().toISOString(), revocationCheckedAt: new Date().toISOString(), validatedAt: new Date().toISOString(),
      sourceChecksum: hash(r.source), signedChecksum: hash(r.signed), validator: 'pyHanko 0.37.0', sourcePreserved: true, offline: true, archiveTimestampCount: 0 }))
    const service = createDeviceService(sandbox.db, { storage, validator })
    const queue = createSigningService(sandbox.db)
    await queue.createJob(f.context, { idempotencyKey: randomUUID(), sourceVersionIds: [v.source.id], signerFingerprint: fingerprint })
    const item = (await queue.claim(f.office.id, f.device.id, 300_000))!
    const lease = { itemId: item.id, leaseToken: item.leaseToken! }
    return { ...f, ...v, service, storage, validator, objects, token, lease, item, queue }
  }
  it('streams only a valid same-office signer lease and verifies immutable source bytes', async () => {
    const f = await setup(), other = await setup()
    const handler = createDeviceHandler(f.service)
    const response = await handler(new NextRequest('https://localhost/api/signing/device/download', {
      method: 'POST', headers: { authorization: `Bearer ${f.token}`, 'content-type': 'application/json' }, body: JSON.stringify(f.lease) }), 'download')
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(sourceBytes)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(JSON.stringify(await f.service.input(f.token, f.lease))).not.toContain(f.source.storageKey)
    await expect(f.service.download(other.token, f.lease)).rejects.toThrow('STALE_LEASE')
    await sandbox.db.signingDevice.update({ where: { id: f.device.id }, data: { role: 'RECEIVER' } })
    await expect(f.service.download(f.token, f.lease)).rejects.toThrow('DEVICE_ROLE_FORBIDDEN')
    await sandbox.db.signingDevice.update({ where: { id: f.device.id }, data: { role: 'SIGNER' } })
    f.objects.set(f.source.storageKey, Buffer.from('%PDF-tampered source'))
    await expect(f.service.download(f.token, f.lease)).rejects.toThrow('CHECKSUM_MISMATCH')
  }, 60_000)
  it('records rejected validation with safe evidence and exposes repeated failures without promoting the document', async () => {
    const f = await setup()
    await f.service.queue(f.token, 'start', { ...f.lease, locallyApproved: true })
    f.validator.mockRejectedValue(new Error('PIN=SECRET service_role=SECRET'))
    await expect(f.service.submitArtifact(f.token, f.lease, signedBytes)).rejects.toThrow('VALIDATION_FAILED')
    f.validator.mockRejectedValue(new SigningError('CERT_REVOKED'))
    await expect(f.service.submitArtifact(f.token, f.lease, signedBytes)).rejects.toThrow('CERT_REVOKED')
    const events = await sandbox.db.activityEvent.findMany({ where: { officeId: f.office.id, eventType: 'signing.validation_failed' } })
    expect(events).toHaveLength(2)
    expect(JSON.stringify(events)).not.toContain('SECRET')
    expect((await createSigningCenter(sandbox.db).list(f.context, {})).alerts!.some(a => a.id === 'VALIDATION_FAILURE')).toBe(true)
    expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: f.doc.id } })).currentVersionId).toBe(f.source.id)
    expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(0)
  }, 60000)
  it('commits one new signed version/evidence/attempt/current pointer and replays the exact result', async () => {
    const f = await setup()
    await f.service.queue(f.token, 'start', f.lease)
    // Committed replay can be resolved even after the local transfer budget stops.
    const handler = createDeviceHandler(f.service)
    const response = await handler(new NextRequest('https://localhost/api/signing/device/result', { method: 'POST',
      headers: { authorization: `Bearer ${f.token}`, 'content-type': 'application/pdf', 'x-signing-item': f.lease.itemId, 'x-signing-lease': f.lease.leaseToken }, body: signedBytes }), 'result')
    expect(response.status).toBe(200)
    const { data: answer } = await response.json()
    expect(answer.committed).toBe(true)
    expect(await f.service.recovery(f.token, f.lease)).toEqual({ released: false, committed: true, checksumSha256: hash(signedBytes) })
    await expect(f.service.recovery(f.token, { ...f.lease, leaseToken: randomUUID() })).rejects.toThrow('STALE_LEASE')
    const committedEvents = await sandbox.db.activityEvent.findMany({ where: { officeId: f.office.id, eventType: { in: ['signing.validated', 'signing.completed'] } } })
    expect(committedEvents).toHaveLength(2)
    expect(committedEvents.every(e => e.requestId === response.headers.get('x-signing-correlation-id'))).toBe(true)
    expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: f.doc.id } })).currentVersionId).toBe(answer.signedVersionId)
    expect(await f.service.submitArtifact(f.token, f.lease, signedBytes)).toEqual(answer)
    expect(vi.mocked(f.validator)).toHaveBeenCalledTimes(1)
    expect(await sandbox.db.documentSignature.count({ where: { itemId: f.item.id } })).toBe(1)
    expect(await sandbox.db.signingAttempt.count({ where: { itemId: f.item.id, result: 'SUCCEEDED' } })).toBe(1)
    expect(await sandbox.db.documentDelivery.count({ where: { officeId: f.office.id } })).toBe(0)
    const upload = await sandbox.db.signingArtifact.findUniqueOrThrow({ where: { id: answer.signedVersionId } })
    expect(upload.state).toBe('COMMITTED')
    expect(f.objects.get(f.source.storageKey)).toEqual(sourceBytes)
    expect(f.objects.get(upload.storageKey)).toEqual(signedBytes)
    await expect(sandbox.db.signingArtifact.update({ where: { id: upload.id }, data: { state: 'CLEANING' } })).rejects.toThrow('IMMUTABLE_SIGNING_UPLOAD')
    await expect(f.service.submitArtifact(f.token, f.lease, Buffer.concat([signedBytes, Buffer.from('changed')]))).rejects.toThrow('RESULT_CONFLICT')
    await expect(f.service.submitArtifact(f.token, { ...f.lease, leaseToken: randomUUID() }, signedBytes)).rejects.toThrow('RESULT_CONFLICT')
  }, 60_000)
  it('rejects failed validation without upload, version promotion or success evidence', async () => {
    const f = await setup()
    await f.service.queue(f.token, 'start', f.lease)
    vi.mocked(f.validator).mockRejectedValueOnce(Error('VALIDATION_FAILED'))
    await expect(f.service.submitArtifact(f.token, f.lease, signedBytes)).rejects.toThrow('VALIDATION_FAILED')
    expect(f.storage.upload).not.toHaveBeenCalled()
    expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: f.doc.id } })).currentVersionId).toBe(f.source.id)
    expect(await sandbox.db.documentSignature.count({ where: { itemId: f.item.id } })).toBe(0)
  }, 60_000)
  it('checks signing state and receiver role before accepting an upload body', async () => {
    const f = await setup()
    await expect(f.service.authorizeUpload(f.token, f.lease)).rejects.toThrow('SIGNING_NOT_STARTED')
    await f.service.queue(f.token, 'start', f.lease)
    await f.service.authorizeUpload(f.token, f.lease)
    await sandbox.db.signingDevice.update({ where: { id: f.device.id }, data: { role: 'RECEIVER' } })
    await expect(f.service.authorizeUpload(f.token, f.lease)).rejects.toThrow('DEVICE_ROLE_FORBIDDEN')
    expect(f.storage.upload).not.toHaveBeenCalled()
  }, 60_000)
  it('rechecks session and lease after upload, before committing a signed version', async () => {
    const f = await setup()
    await f.service.queue(f.token, 'start', f.lease)
    vi.mocked(f.storage.upload).mockImplementationOnce(async (_bucket, key, bytes) => {
      f.objects.set(key, bytes)
      await sandbox.db.signingItem.update({ where: { id: f.item.id }, data: { leaseExpiresAt: new Date(0) } })
    })
    await expect(f.service.submitArtifact(f.token, f.lease, signedBytes)).rejects.toThrow('STALE_LEASE')
    expect(await sandbox.db.documentSignature.count({ where: { itemId: f.item.id } })).toBe(0)
    expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: f.doc.id } })).currentVersionId).toBe(f.source.id)
    expect((await sandbox.db.signingArtifact.findFirstOrThrow({ where: { itemId: f.item.id } })).state).toBe('PENDING')
  }, 60_000)
  it('fences revocation and lease expiry during independent validation', async () => {
    for (const mode of ['revoke', 'expire']) {
      const f = await setup()
      await f.service.queue(f.token, 'start', f.lease)
      const original = vi.mocked(f.validator).getMockImplementation()! as PdfValidator
      vi.mocked(f.validator).mockImplementationOnce(async r => {
        if (mode === 'revoke') await f.service.revoke(f.context, f.device.id)
        else await sandbox.db.signingItem.update({ where: { id: f.item.id }, data: { leaseExpiresAt: new Date(0) } })
        return original(r)
      })
      await expect(f.service.submitArtifact(f.token, f.lease, signedBytes)).rejects.toThrow()
      expect(f.storage.upload).not.toHaveBeenCalled()
      expect(await sandbox.db.documentSignature.count({ where: { itemId: f.item.id } })).toBe(0)
    }
  }, 60_000)
  it('rolls back version creation and promotion if canonical audit rejects the commit', async () => {
    const f = await setup()
    await f.service.queue(f.token, 'start', f.lease)
    await sandbox.db.$executeRawUnsafe(`CREATE FUNCTION "${sandbox.schema}".reject_artifact_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" = 'signing.completed' THEN RAISE EXCEPTION 'AUDIT_FAILURE'; END IF; RETURN NEW; END $$`)
    await sandbox.db.$executeRawUnsafe(`CREATE TRIGGER reject_artifact_audit BEFORE INSERT ON "${sandbox.schema}".activity_events FOR EACH ROW EXECUTE FUNCTION "${sandbox.schema}".reject_artifact_audit()`)
    try {
      await expect(f.service.submitArtifact(f.token, f.lease, signedBytes)).rejects.toThrow('AUDIT_FAILURE')
      expect(await sandbox.db.documentoVersion.count({ where: { documentoId: f.doc.id } })).toBe(2)
      expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: f.doc.id } })).currentVersionId).toBe(f.source.id)
      expect(await sandbox.db.documentSignature.count({ where: { itemId: f.item.id } })).toBe(0)
      expect((await sandbox.db.signingArtifact.findFirstOrThrow({ where: { itemId: f.item.id } })).state).toBe('PENDING')
    } finally { await sandbox.db.$executeRawUnsafe(`DROP TRIGGER reject_artifact_audit ON "${sandbox.schema}".activity_events`) }
  }, 60_000)
  it('handles concurrent identical submissions without duplicate signed versions', async () => {
    const f = await setup()
    await f.service.queue(f.token, 'start', f.lease)
    const answers = await Promise.all([f.service.submitArtifact(f.token, f.lease, signedBytes), f.service.submitArtifact(f.token, f.lease, signedBytes)])
    expect(answers[0]).toEqual(answers[1])
    expect(await sandbox.db.documentSignature.count({ where: { itemId: f.item.id } })).toBe(1)
    expect(await sandbox.db.documentoVersion.count({ where: { documentoId: f.doc.id } })).toBe(3)
  }, 60_000)
  it('rejects collisions/corrupt retained uploads and never overwrites the source', async () => {
    const f = await setup()
    await f.service.queue(f.token, 'start', f.lease)
    vi.mocked(f.storage.upload).mockRejectedValueOnce(Error('COLLISION'))
    await expect(f.service.submitArtifact(f.token, f.lease, signedBytes)).rejects.toThrow('COLLISION')
    vi.mocked(f.storage.upload).mockImplementationOnce(async (_b, key) => { f.objects.set(key, Buffer.from('corrupt')) })
    await expect(f.service.submitArtifact(f.token, f.lease, signedBytes)).rejects.toThrow('CHECKSUM_MISMATCH')
    expect(f.objects.get(f.source.storageKey)).toEqual(sourceBytes)
    expect(await sandbox.db.documentSignature.count({ where: { itemId: f.item.id } })).toBe(0)
  }, 60_000)
  it('cleans only expired uncommitted reservations and preserves committed objects', async () => {
    const f = await setup()
    await f.service.queue(f.token, 'start', f.lease)
    await f.service.submitArtifact(f.token, f.lease, signedBytes)
    const id = randomUUID(), key = `offices/${f.office.id}/signing/${f.item.id}/${id}.pdf`
    await sandbox.db.signingArtifact.create({ data: { id, officeId: f.office.id, deviceId: f.device.id,
      itemId: f.item.id, leaseToken: f.lease.leaseToken, storageBucket: f.source.storageBucket, storageKey: key,
      checksumSha256: hash(signedBytes), sizeBytes: signedBytes.length, expiresAt: new Date(0) } })
    f.objects.set(key, signedBytes)
    expect(await f.service.cleanupArtifacts(f.office.id)).toBe(1)
    expect(await f.service.cleanupArtifacts(f.office.id)).toBe(0)
    expect(f.objects.has(key)).toBe(false)
    expect(f.objects.size).toBe(2)
    expect((await sandbox.db.signingArtifact.findUniqueOrThrow({ where: { id } })).state).toBe('DELETED')
  }, 60_000)
})
