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
import { createSigningCenter } from '../../lib/signing/center'

const source = Buffer.from('%PDF-1.7\nSynthetic receiver source\n%%EOF')
const output = Buffer.concat([source, Buffer.from('\nTest signature')])
describe.skipIf(process.env.SIGNING_DATABASE_TESTS !== '1')('Retired receiver delivery compatibility', () => {
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
  async function legacyTransfer(f: Awaited<ReturnType<typeof setup>>, status: 'PENDING' | 'DOWNLOADING' = 'DOWNLOADING') {
    const signed = await f.commit()
    return sandbox.db.documentDelivery.create({ data: { officeId: f.office.id, deviceId: f.receiver.id,
      signatureId: signed.signatureId, status, attemptCount: status === 'DOWNLOADING' ? 1 : 0 } })
  }
  it('commits once without delivery fan-out and exposes the same office documents on every role', async () => {
    const f = await setup()
    const second = await sandbox.db.signingDevice.create({ data: { officeId: f.office.id, name: 'Receiver 2', role: 'RECEIVER' } })
    const secondToken = await f.session(second.id)
    await f.commit(); await f.commit()
    expect(await sandbox.db.documentDelivery.count({ where: { officeId: f.office.id } })).toBe(0)
    for (const token of [f.signerToken, f.receiverToken, secondToken]) {
      const page = await f.service.officeFolder(token, {})
      expect(page.documents).toHaveLength(1)
      expect(await f.service.officeFolderDownload(token, { signatureId: page.documents[0].signatureId, checksumSha256: page.documents[0].checksumSha256 })).toEqual(output)
    }
    expect(f.storage.remove).not.toHaveBeenCalled()
    expect(f.objects.get(f.source.storageKey)).toEqual(source)
  }, 60000)
  it('retires pending fan-out while allowing an already started legacy transfer to finish and acknowledge once', async () => {
    const f = await setup(), d = await legacyTransfer(f, 'PENDING')
    const request = { deliveryId: d.id, checksumSha256: sha256(output) }
    expect((await f.service.pendingDeliveries(f.receiverToken, {})).deliveries).toHaveLength(0)
    await expect(f.service.beginDelivery(f.receiverToken, request)).rejects.toThrow('DELIVERY_RETIRED')
    await expect(f.service.downloadDelivery(f.receiverToken, request)).rejects.toThrow('DELIVERY_RETIRED')
    await sandbox.db.documentDelivery.update({ where: { id: d.id }, data: { status: 'DOWNLOADING', attemptCount: 1 } })
    expect((await f.service.pendingDeliveries(f.receiverToken, {})).deliveries).toHaveLength(1)
    await f.service.beginDelivery(f.receiverToken, request)
    expect(await f.service.downloadDelivery(f.receiverToken, request)).toEqual(output)
    await f.service.acknowledge(f.receiverToken, request); await f.service.acknowledge(f.receiverToken, request)
    expect((await f.service.pendingDeliveries(f.receiverToken, {})).deliveries).toHaveLength(0)
    expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'device.delivery_acknowledged' } })).toBe(1)
  }, 60000)
  it('preserves office, role, checksum and revocation checks for transfers started before upgrade', async () => {
    const f = await setup(), foreign = await setup(), d = await legacyTransfer(f)
    const request = { deliveryId: d.id, checksumSha256: sha256(output) }
    await expect(f.service.downloadDelivery(foreign.receiverToken, request)).rejects.toThrow('NOT_FOUND')
    await expect(f.service.downloadDelivery(f.signerToken, request)).rejects.toThrow('DEVICE_ROLE_FORBIDDEN')
    await expect(f.service.downloadDelivery(randomBytes(32).toString('base64url'), request)).rejects.toThrow('DEVICE_UNAUTHORIZED')
    vi.mocked(f.storage.download).mockResolvedValueOnce(Buffer.from('bad'))
    await expect(f.service.downloadDelivery(f.receiverToken, request)).rejects.toThrow('CHECKSUM_MISMATCH')
    vi.mocked(f.storage.download).mockImplementationOnce(async () => { await f.service.revoke(f.context, f.receiver.id); return output })
    await expect(f.service.downloadDelivery(f.receiverToken, request)).rejects.toThrow('DEVICE_UNAUTHORIZED')
    expect((await sandbox.db.documentDelivery.findUniqueOrThrow({ where: { id: d.id } })).deliveredAt).toBeNull()
  }, 60000)
  it('retains failed legacy history without restarting deliveries or showing stale delivery alarms', async () => {
    const f = await setup(), d = await legacyTransfer(f), center = createSigningCenter(sandbox.db)
    const request = { deliveryId: d.id, checksumSha256: sha256(output) }
    await f.service.failDelivery(f.receiverToken, { ...request, errorCode: 'DISK' })
    const failed = await sandbox.db.documentDelivery.findUniqueOrThrow({ where: { id: d.id } })
    await f.service.failDelivery(f.receiverToken, { ...request, errorCode: 'NETWORK' })
    expect((await sandbox.db.documentDelivery.findUniqueOrThrow({ where: { id: d.id } })).availableAt).toEqual(failed.availableAt)
    expect((await f.service.pendingDeliveries(f.receiverToken, {})).deliveries).toHaveLength(0)
    await expect(center.mutate(f.context, { action: 'retry-delivery', deliveryId: d.id, attemptCount: 1, reviewed: true })).rejects.toThrow('DELIVERY_RETIRED')
    const view = await center.list(f.context, {})
    expect(view.alerts!.some(a => a.id === 'DELIVERY_FAILURE')).toBe(false)
    expect(view.rows.find(r => r.evidence)?.delivery).toBe('Disponible en la carpeta de la oficina')
    expect(view.counts.deliveryPending).toBe(0)
  }, 60000)
  it('makes history available to newly enrolled receivers without backfilling a delivery queue', async () => {
    const f = await setup(); await f.commit()
    const keys = generateKeyPairSync('rsa', { modulusLength: 3072 }), publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    const enrollment = await f.service.createEnrollment(f.context, { role: 'RECEIVER' }), name = 'Late receiver'
    const enrolled = await f.service.enroll({ code: enrollment.code, name, publicKey,
      signature: sign('sha256', Buffer.from(enrollmentMessage(enrollment.code, publicKey, name)), keys.privateKey).toString('base64') })
    const token = await f.session(enrolled.deviceId)
    expect((await f.service.pendingDeliveries(token, {})).deliveries).toHaveLength(0)
    expect((await f.service.officeFolder(token, {})).documents).toHaveLength(1)
    expect(await sandbox.db.documentDelivery.count({ where: { deviceId: enrolled.deviceId } })).toBe(0)
  }, 60000)
  it('does not couple signature commit to the retired delivery table', async () => {
    const f = await setup()
    await sandbox.db.$executeRawUnsafe(`CREATE FUNCTION "${sandbox.schema}".reject_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'DELIVERY_TEST_FAILURE'; END $$`)
    await sandbox.db.$executeRawUnsafe(`CREATE TRIGGER reject_delivery BEFORE INSERT ON "${sandbox.schema}".document_deliveries FOR EACH ROW EXECUTE FUNCTION "${sandbox.schema}".reject_delivery()`)
    try {
      const signature = await f.commit()
      expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(1)
      expect(await sandbox.db.documentDelivery.count({ where: { officeId: f.office.id } })).toBe(0)
      expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: f.doc.id } })).currentVersionId).toBe(signature.signedVersionId)
    } finally { await sandbox.db.$executeRawUnsafe(`DROP TRIGGER reject_delivery ON "${sandbox.schema}".document_deliveries`) }
  }, 60000)
})
