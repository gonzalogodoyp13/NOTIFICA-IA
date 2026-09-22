import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, fingerprint, hashB } from './signing-support'
vi.mock('server-only', () => ({}))
import { createDeviceService } from '../../lib/signing/devices'
import { createSigningService } from '../../lib/signing/service'
import { createDeviceHandler } from '../../lib/signing/deviceHttp'
import { enrollmentMessage, sessionMessage } from '../../lib/signing/deviceProtocol'

describe.skipIf(process.env.SIGNING_DATABASE_TESTS !== '1')('device enrollment/authentication with real database', () => {
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>
  let service: ReturnType<typeof createDeviceService>
  beforeAll(async () => { sandbox = await createSigningTestDatabase(); service = createDeviceService(sandbox.db) }, 120_000)
  afterAll(async () => { if (sandbox) await sandbox.dispose() }, 60_000)
  async function startRateWindow() {
    const [{ now }] = await sandbox.db.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
    const remaining = 60_000 - now.getTime() % 60_000
    // These are real database fixed windows. Leave enough time for network
    // round trips so a legitimate minute rollover cannot reset the test quota.
    if (remaining < 40_000) await new Promise(resolve => setTimeout(resolve, remaining + 250))
  }
  async function setup(role: 'SIGNER' | 'RECEIVER' = 'SIGNER', existing?: Awaited<ReturnType<typeof signingFixture>>) {
    const f = existing ?? await signingFixture(sandbox.db)
    const keys = generateKeyPairSync('rsa', { modulusLength: 3072 })
    const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
    const proof = (message: string) => sign('sha256', Buffer.from(message), keys.privateKey).toString('base64')
    const code = await service.createEnrollment(f.context, { role })
    const enrollment = { code: code.code, name: 'Windows test', publicKey, signature: proof(enrollmentMessage(code.code, publicKey, 'Windows test')) }
    const device = await service.enroll(enrollment)
    async function auth() {
      const challenge = await service.challenge({ deviceId: device.deviceId })
      const request = { deviceId: device.deviceId, challengeId: challenge.challengeId, nonce: challenge.nonce,
        signature: proof(sessionMessage(device.deviceId, challenge.challengeId, challenge.nonce)) }
      return { request, ...(await service.session(request)) }
    }
    const session = await auth()
    const report = { agentVersion: '0.5.0', role, diskFreeBytes: 1000, lastSuccessfulContactAt: null,
      token: role === 'RECEIVER' ? 'NOT_APPLICABLE' : 'READY', certificate: role === 'RECEIVER' ? null : {
        fingerprint, subject: 'Synthetic signer', issuer: 'Synthetic issuer', digitalSignature: true,
        notBefore: '2020-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' } }
    await service.heartbeat(session.token, report)
    return { ...f, enrolled: device, enrollment, session, auth, proof, report }
  }
  it('atomically consumes codes, rejects expired/revoked codes and denies ordinary users', async () => {
    const f = await setup()
    await expect(service.enroll(f.enrollment)).rejects.toThrow('ENROLLMENT_INVALID')
    const code = await service.createEnrollment(f.context, { role: 'SIGNER' })
    await sandbox.db.deviceEnrollment.update({ where: { id: code.enrollmentId }, data: { expiresAt: new Date(0) } })
    const input = { ...f.enrollment, code: code.code, signature: f.proof(enrollmentMessage(code.code, f.enrollment.publicKey, f.enrollment.name)) }
    await expect(service.enroll(input)).rejects.toThrow('ENROLLMENT_INVALID')
    const revoked = await service.createEnrollment(f.context, { role: 'SIGNER' })
    await service.revokeEnrollment(f.context, revoked.enrollmentId)
    await expect(service.enroll({ ...input, code: revoked.code, signature: f.proof(enrollmentMessage(revoked.code, input.publicKey, input.name)) })).rejects.toThrow('ENROLLMENT_INVALID')
    await sandbox.db.user.update({ where: { id: f.user.id }, data: { isOfficeAdmin: false } })
    await expect(service.createEnrollment(f.context, { role: 'SIGNER' })).rejects.toThrow('FORBIDDEN')
  }, 60_000)
  it('fences challenge replay, expires sessions, rejects wrong key and renews only with new proof', async () => {
    const f = await setup()
    await expect(service.session(f.session.request)).rejects.toThrow('DEVICE_UNAUTHORIZED')
    const c = await service.challenge({ deviceId: f.enrolled.deviceId })
    const req = { deviceId: f.enrolled.deviceId, challengeId: c.challengeId, nonce: c.nonce, signature: f.proof(sessionMessage(f.enrolled.deviceId, c.challengeId, c.nonce)) }
    const wrongKey = generateKeyPairSync('rsa', { modulusLength: 3072 })
    await expect(service.session({ ...req, signature: sign('sha256', Buffer.from(sessionMessage(req.deviceId, c.challengeId, c.nonce)), wrongKey.privateKey).toString('base64') })).rejects.toThrow('DEVICE_UNAUTHORIZED')
    const responses = await Promise.allSettled([service.session(req), service.session(req)])
    expect(responses.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const expired = await service.challenge({ deviceId: f.enrolled.deviceId })
    await sandbox.db.deviceChallenge.update({ where: { id: expired.challengeId }, data: { expiresAt: new Date(0) } })
    await expect(service.session({ ...req, challengeId: expired.challengeId, nonce: expired.nonce, signature: f.proof(sessionMessage(req.deviceId, expired.challengeId, expired.nonce)) })).rejects.toThrow('DEVICE_UNAUTHORIZED')
    await sandbox.db.deviceSession.updateMany({ where: { deviceId: f.enrolled.deviceId }, data: { expiresAt: new Date(0) } })
    await expect(service.heartbeat(f.session.token, f.report)).rejects.toThrow('DEVICE_UNAUTHORIZED')
    const renewed = await f.auth()
    expect((await service.heartbeat(renewed.token, f.report)).health).toBe('TOKEN_READY')
  }, 60_000)
  it('authorizes HTTPS claims, scopes leases and blocks revocation across every endpoint', async () => {
    const f = await setup()
    const other = await setup()
    const version = await f.document()
    await createSigningService(sandbox.db).createJob(f.context, { idempotencyKey: randomUUID(), sourceVersionIds: [version.source.id], signerFingerprint: fingerprint })
    const handler = createDeviceHandler(service)
    const req = new NextRequest('https://localhost/api/signing/device/claim', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${f.session.token}` }, body: '{}' })
    const response = await handler(req, 'claim')
    expect(response.status).toBe(200)
    const { data: claimed } = await response.json()
    const lease = { itemId: claimed.itemId, leaseToken: claimed.leaseToken }
    expect((await service.input(f.session.token, lease)).checksumSha256).toBe(version.source.checksumSha256)
    await expect(service.input(other.session.token, lease)).rejects.toThrow('STALE_LEASE')
    await expect(service.queue(other.session.token, 'renew', lease)).rejects.toThrow('STALE_LEASE')
    await expect(service.result(f.session.token, lease)).rejects.toThrow('ARTIFACT_VALIDATION_NOT_AVAILABLE')
    await expect(service.revoke(other.context, f.enrolled.deviceId)).rejects.toThrow('NOT_FOUND')
    await service.revoke(f.context, f.enrolled.deviceId)
    await expect(service.challenge({ deviceId: f.enrolled.deviceId })).rejects.toThrow('DEVICE_UNAUTHORIZED')
    await expect(service.session(f.session.request)).rejects.toThrow('DEVICE_UNAUTHORIZED')
    for (const op of [() => service.heartbeat(f.session.token, f.report), () => service.queue(f.session.token, 'claim', {}),
      () => service.queue(f.session.token, 'renew', lease), () => service.input(f.session.token, lease), () => service.result(f.session.token, lease),
      () => service.acknowledge(f.session.token, { deliveryId: 'unknown', checksumSha256: fingerprint })]) await expect(op()).rejects.toThrow('DEVICE_UNAUTHORIZED')
    expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(0)
    expect(JSON.stringify(await service.list(f.context))).not.toContain('publicKey')
  }, 60_000)
  it('receivers cannot claim; heartbeat clears removed token metadata and derives stale health', async () => {
    const receiver = await setup('RECEIVER')
    await expect(service.queue(receiver.session.token, 'claim', {})).rejects.toThrow('DEVICE_ROLE_FORBIDDEN')
    await expect(service.input(receiver.session.token, { itemId: 'unknown', leaseToken: randomUUID() })).rejects.toThrow('DEVICE_ROLE_FORBIDDEN')
    const f = await setup()
    await service.heartbeat(f.session.token, { ...f.report, token: 'MISSING', certificate: null })
    let device = (await service.list(f.context)).find(d => d.id === f.enrolled.deviceId)!
    expect(device.health).toBe('AGENT_ONLINE_TOKEN_MISSING')
    expect(device.certificateThumbprint).toBeNull()
    await sandbox.db.signingDevice.update({ where: { id: device.id }, data: { lastHeartbeatAt: new Date(0) } })
    device = (await service.list(f.context)).find(d => d.id === device.id)!
    expect(device.health).toBe('OFFLINE')
    await expect(service.queue(f.session.token, 'claim', {})).rejects.toThrow('DEVICE_OFFLINE')
    const records = JSON.stringify(await sandbox.db.activityEvent.findMany({ where: { officeId: f.office.id } }))
    expect(records).not.toContain(f.enrollment.code)
    expect(records).not.toContain(f.session.token)
  }, 60_000)
  it('enforces a shared atomic rate limit under concurrent requests', async () => {
    const id = randomUUID()
    await startRateWindow()
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.throttle('test', id, 3)))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(3)
  }, 60_000)
  it('does not reset a device rate limit when it obtains a fresh session', async () => {
    const f = await setup()
    await startRateWindow()
    await Promise.all(Array.from({ length: 6 }, () => service.limitAuthenticated(f.session.token, 'heartbeat')))
    const next = await f.auth()
    await expect(service.limitAuthenticated(next.token, 'heartbeat')).rejects.toThrow('RATE_LIMITED')
  }, 90_000)
  it('races enrollment once and rolls back device/code changes when canonical audit fails', async () => {
    const f = await signingFixture(sandbox.db)
    const keys = generateKeyPairSync('rsa', { modulusLength: 3072 })
    const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
    const code = await service.createEnrollment(f.context, { role: 'SIGNER' })
    const input = { code: code.code, name: 'Atomic enrollment', publicKey,
      signature: sign('sha256', Buffer.from(enrollmentMessage(code.code, publicKey, 'Atomic enrollment')), keys.privateKey).toString('base64') }
    await sandbox.db.$executeRawUnsafe(`CREATE FUNCTION "${sandbox.schema}".reject_device_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" = 'device.enrolled' THEN RAISE EXCEPTION 'DEVICE_AUDIT_TEST_FAILURE'; END IF; RETURN NEW; END $$`)
    await sandbox.db.$executeRawUnsafe(`CREATE TRIGGER reject_device_audit BEFORE INSERT ON "${sandbox.schema}".activity_events FOR EACH ROW EXECUTE FUNCTION "${sandbox.schema}".reject_device_audit()`)
    try {
      await expect(service.enroll(input)).rejects.toThrow('DEVICE_AUDIT_TEST_FAILURE')
      expect((await sandbox.db.deviceEnrollment.findUniqueOrThrow({ where: { id: code.enrollmentId } })).consumedAt).toBeNull()
      expect(await sandbox.db.signingDevice.count({ where: { publicKey } })).toBe(0)
    } finally {
      await sandbox.db.$executeRawUnsafe(`DROP TRIGGER reject_device_audit ON "${sandbox.schema}".activity_events`)
      await sandbox.db.$executeRawUnsafe(`DROP FUNCTION "${sandbox.schema}".reject_device_audit()`)
    }
    const races = await Promise.allSettled([service.enroll(input), service.enroll(input)])
    expect(races.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await sandbox.db.signingDevice.count({ where: { publicKey } })).toBe(1)
    expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'device.enrolled' } })).toBe(1)
  }, 60_000)
  it('acknowledges only the assigned receiver/checksum and makes delivery acknowledgement idempotent', async () => {
    const f = await setup()
    const receiver = await setup('RECEIVER', f)
    const foreign = await setup('RECEIVER')
    const version = await f.document()
    const queue = createSigningService(sandbox.db)
    await queue.createJob(f.context, { idempotencyKey: randomUUID(), sourceVersionIds: [version.source.id], signerFingerprint: fingerprint, requestedLevel: 'PADES_B' })
    const item = (await queue.claim(f.office.id, f.enrolled.deviceId))!
    const lease = { officeId: f.office.id, deviceId: f.enrolled.deviceId, itemId: item.id, leaseToken: item.leaseToken! }
    await queue.start(lease)
    const signature = await queue.complete(lease, { signedVersionId: version.output.id, signedChecksum: hashB, signerFingerprint: fingerprint,
      certificateIssuer: 'Synthetic issuer', providerType: 'FAKE_TEST_WORKER', level: 'PADES_B', validatedAt: new Date(), revocationCheckedAt: new Date() })
    const delivery = await sandbox.db.documentDelivery.create({ data: { officeId: f.office.id, deviceId: receiver.enrolled.deviceId, signatureId: signature.id, status: 'DOWNLOADING' } })
    const request = { deliveryId: delivery.id, checksumSha256: hashB }
    await expect(service.acknowledge(f.session.token, request)).rejects.toThrow('DEVICE_ROLE_FORBIDDEN')
    await expect(service.acknowledge(foreign.session.token, request)).rejects.toThrow('NOT_FOUND')
    await expect(service.acknowledge(receiver.session.token, { ...request, checksumSha256: fingerprint })).rejects.toThrow('DELIVERY_CONFLICT')
    expect(await service.acknowledge(receiver.session.token, request)).toEqual({ delivered: true })
    const acknowledged = await sandbox.db.documentDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
    expect(acknowledged.status).toBe('DELIVERED')
    await service.acknowledge(receiver.session.token, request)
    expect((await sandbox.db.documentDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).deliveredAt).toEqual(acknowledged.deliveredAt)
    expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'device.delivery_acknowledged' } })).toBe(1)
    await service.revoke(f.context, receiver.enrolled.deviceId)
    await expect(service.acknowledge(receiver.session.token, request)).rejects.toThrow('DEVICE_UNAUTHORIZED')
  }, 60_000)
})
