import { randomBytes, randomUUID, generateKeyPairSync, sign } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, fingerprint } from './signing-support'
vi.mock('server-only', () => ({}))
import { createDeviceService } from '../../lib/signing/devices'
import { createSigningService } from '../../lib/signing/service'
import { sha256, enrollmentMessage } from '../../lib/signing/deviceProtocol'
import type { SigningStorage } from '../../lib/signing/artifacts'
import type { PdfValidator } from '../../lib/signing/pdfValidator'

const source = Buffer.from('%PDF-1.7\nSynthetic receiver source\n%%EOF')
const output = Buffer.concat([source, Buffer.from('\nTest signature')])
describe.skipIf(process.env.SIGNING_DATABASE_TESTS !== '1')('Phase 9 receiver delivery', () => {
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>
  beforeAll(async () => { sandbox = await createSigningTestDatabase() }, 120000)
  afterAll(async () => { if (sandbox) await sandbox.dispose() }, 60000)
  async function setup() {
    const f = await signingFixture(sandbox.db), v = await f.document()
    await sandbox.db.documentoVersion.update({ where: { id: v.source.id }, data: { checksumSha256: sha256(source), sizeBytes: source.length } })
    const objects = new Map<string, Buffer>([[v.source.storageKey, source]])
    const storage: SigningStorage = { assertPrivate: vi.fn(async () => {}),
      download: vi.fn(async (_b, k) => objects.get(k)!), upload: async (_b, k, bytes) => { objects.set(k, Buffer.from(bytes)) }, remove: vi.fn(async () => {}) }
    const validator: PdfValidator = async r => ({ signerFingerprint: r.signerFingerprint, certificateIssuer: 'Synthetic', providerType: 'PYHANKO_0_37_SERVER',
      level: r.requestedLevel, timestampAt: new Date().toISOString(), revocationCheckedAt: new Date().toISOString(), validatedAt: new Date().toISOString(),
      sourceChecksum: sha256(r.source), signedChecksum: sha256(r.signed), validator: 'pyHanko 0.37.0', sourcePreserved: true, offline: true, archiveTimestampCount: 0 })
    const service = createDeviceService(sandbox.db, { storage, validator }), queue = createSigningService(sandbox.db)
    async function session(deviceId: string) {
      const token = randomBytes(32).toString('base64url')
      await sandbox.db.deviceSession.create({ data: { deviceId, officeId: f.office.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 600000) } })
      return token
    }
    const signerToken = await session(f.device.id), receiverToken = await session(f.receiver.id)
    await queue.createJob(f.context, { idempotencyKey: randomUUID(), sourceVersionIds: [v.source.id], signerFingerprint: fingerprint })
    const claimed = (await queue.claim(f.office.id, f.device.id))!, lease = { itemId: claimed.id, leaseToken: claimed.leaseToken! }
    await service.queue(signerToken, 'start', lease)
    const commit = () => service.submitArtifact(signerToken, lease, output)
    return { ...f, ...v, service, queue, storage, objects, signerToken, receiverToken, session, commit }
  }
  it('schedules only after validated commit, delivers identical bytes to two assigned receivers, and acknowledges idempotently', async () => {
    const f = await setup()
    const second = await sandbox.db.signingDevice.create({ data: { officeId: f.office.id, name: 'Receiver 2', role: 'RECEIVER' } })
    const secondToken = await f.session(second.id)
    expect((await f.service.pendingDeliveries(f.receiverToken, {})).deliveries).toHaveLength(0)
    await f.commit(); await f.commit()
    expect(await sandbox.db.documentDelivery.count({ where: { officeId: f.office.id } })).toBe(2)
    for (const token of [f.receiverToken, secondToken]) {
      const page = await f.service.pendingDeliveries(token, {}), d = page.deliveries[0]
      expect(page.deliveries).toHaveLength(1)
      const request = { deliveryId: d.deliveryId, checksumSha256: d.checksumSha256 }
      await f.service.beginDelivery(token, request)
      expect(await f.service.downloadDelivery(token, request)).toEqual(output)
      expect((await sandbox.db.documentDelivery.findUniqueOrThrow({ where: { id: d.deliveryId } })).attemptCount).toBe(1)
      await f.service.acknowledge(token, request); await f.service.acknowledge(token, request)
      expect((await f.service.pendingDeliveries(token, {})).deliveries).toHaveLength(0)
    }
    expect(f.storage.remove).not.toHaveBeenCalled()
    expect(f.objects.get(f.source.storageKey)).toEqual(source)
  }, 60000)
  it('rejects foreign receivers, unassigned deliveries, signer-only devices, invalid tokens and revoked receivers', async () => {
    const f = await setup(), foreign = await setup(); await f.commit()
    const d = (await f.service.pendingDeliveries(f.receiverToken, {})).deliveries[0]
    const request = { deliveryId: d.deliveryId, checksumSha256: d.checksumSha256 }
    await expect(f.service.pendingDeliveries(f.signerToken, {})).rejects.toThrow('DEVICE_ROLE_FORBIDDEN')
    await expect(f.service.downloadDelivery(foreign.receiverToken, request)).rejects.toThrow('NOT_FOUND')
    await expect(f.service.downloadDelivery(randomBytes(32).toString('base64url'), request)).rejects.toThrow('DEVICE_UNAUTHORIZED')
    await expect(f.service.queue(f.receiverToken, 'claim', {})).rejects.toThrow('DEVICE_ROLE_FORBIDDEN')
    await f.service.revoke(f.context, f.receiver.id)
    for (const action of [() => f.service.pendingDeliveries(f.receiverToken, {}), () => f.service.downloadDelivery(f.receiverToken, request), () => f.service.acknowledge(f.receiverToken, request)])
      await expect(action()).rejects.toThrow('DEVICE_UNAUTHORIZED')
  }, 60000)
  it('rejects corrupted storage and revocation during I/O without acknowledging delivery', async () => {
    const f = await setup(); await f.commit()
    const d = (await f.service.pendingDeliveries(f.receiverToken, {})).deliveries[0]
    const request = { deliveryId: d.deliveryId, checksumSha256: d.checksumSha256 }
    vi.mocked(f.storage.download).mockResolvedValueOnce(Buffer.from('bad'))
    await expect(f.service.downloadDelivery(f.receiverToken, request)).rejects.toThrow('CHECKSUM_MISMATCH')
    vi.mocked(f.storage.download).mockImplementationOnce(async () => { await f.service.revoke(f.context, f.receiver.id); return output })
    await expect(f.service.downloadDelivery(f.receiverToken, request)).rejects.toThrow('DEVICE_UNAUTHORIZED')
    expect((await sandbox.db.documentDelivery.findUniqueOrThrow({ where: { id: d.deliveryId } })).deliveredAt).toBeNull()
  }, 60000)
  it('wraps a durable cursor so earlier delayed work is eventually retried', async () => {
    const f = await setup(); await f.commit()
    const page = await f.service.pendingDeliveries(f.receiverToken, {}), d = page.deliveries[0]
    await f.service.failDelivery(f.receiverToken, { deliveryId: d.deliveryId, checksumSha256: d.checksumSha256, errorCode: 'DISK' })
    expect((await f.service.pendingDeliveries(f.receiverToken, {})).deliveries).toHaveLength(0)
    expect((await f.service.pendingDeliveries(f.receiverToken, { cursor: page.nextCursor })).nextCursor).toBeNull()
    await sandbox.db.documentDelivery.update({ where: { id: d.deliveryId }, data: { availableAt: new Date(0) } })
    expect((await f.service.pendingDeliveries(f.receiverToken, { cursor: null })).deliveries[0].deliveryId).toBe(d.deliveryId)
    const request = { deliveryId: d.deliveryId, checksumSha256: d.checksumSha256 }
    await f.service.beginDelivery(f.receiverToken, request)
    await f.service.acknowledge(f.receiverToken, request)
    expect((await sandbox.db.documentDelivery.findUniqueOrThrow({ where: { id: d.deliveryId } })).errorCode).toBeNull()
  }, 60000)
  it('backfills committed signatures when a new receiver enrolls', async () => {
    const f = await setup(); await f.commit()
    const keys = generateKeyPairSync('rsa', { modulusLength: 3072 }), publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    const enrollment = await f.service.createEnrollment(f.context, { role: 'RECEIVER' }), name = 'Late receiver'
    const enrolled = await f.service.enroll({ code: enrollment.code, name, publicKey,
      signature: sign('sha256', Buffer.from(enrollmentMessage(enrollment.code, publicKey, name)), keys.privateKey).toString('base64') })
    expect((await f.service.pendingDeliveries(await f.session(enrolled.deviceId), {})).deliveries).toHaveLength(1)
  }, 60000)
  it('rolls signature, current pointer and deliveries back when delivery insertion fails', async () => {
    const f = await setup()
    await sandbox.db.$executeRawUnsafe(`CREATE FUNCTION "${sandbox.schema}".reject_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'DELIVERY_TEST_FAILURE'; END $$`)
    await sandbox.db.$executeRawUnsafe(`CREATE TRIGGER reject_delivery BEFORE INSERT ON "${sandbox.schema}".document_deliveries FOR EACH ROW EXECUTE FUNCTION "${sandbox.schema}".reject_delivery()`)
    try {
      await expect(f.commit()).rejects.toThrow('DELIVERY_TEST_FAILURE')
      expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(0)
      expect(await sandbox.db.documentDelivery.count({ where: { officeId: f.office.id } })).toBe(0)
      expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: f.doc.id } })).currentVersionId).toBe(f.source.id)
    } finally { await sandbox.db.$executeRawUnsafe(`DROP TRIGGER reject_delivery ON "${sandbox.schema}".document_deliveries`) }
  }, 60000)
})
