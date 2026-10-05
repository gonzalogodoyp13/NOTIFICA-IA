import 'server-only'
import { randomBytes } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../prisma'
import { recordCriticalEvent } from '../audit/activityEvent'
import { lockSigningOffice } from './transaction'
import { createSigningService } from './service'
import { createArtifactService, signingStorage, type ArtifactDependencies } from './artifacts'
import { createDeliveryService } from './deliveries'
import { createOfficeFolderService } from './officeFolder'
import { type SigningContext, SigningError, SigningFailureCode } from './core'
import { Certificate, DeviceError, DeviceId, DeviceLease, Enroll, Heartbeat, Role, Secret, SessionProof,
  enrollmentMessage, observedHealth, publicIdentity, sessionMessage, sha256, verifyProof } from './deviceProtocol'

import { requireSupportedAgent } from './agentRelease'
type Tx = Prisma.TransactionClient
const secret = () => randomBytes(32).toString('base64url')
const signerRoles = ['SIGNER', 'SIGNER_RECEIVER']
const receiverRoles = ['RECEIVER', 'SIGNER_RECEIVER']
const sessionMs = 5 * 60_000
const staleMs = 90_000
export function createDeviceService(db: PrismaClient = prisma, artifactDependencies: ArtifactDependencies = {}) {
  async function transaction<T>(officeId: number, fn: (tx: Tx, now: Date) => Promise<T>) {
    return db.$transaction(async tx => fn(tx, await lockSigningOffice(tx, officeId)), { timeout: 30_000, maxWait: 15_000 })
  }
  async function admin(tx: Tx, context: SigningContext) {
    if (!await tx.user.findFirst({ where: { id: context.userId, officeId: context.officeId, isActive: true, isOfficeAdmin: true } })) throw new DeviceError('FORBIDDEN')
  }
  async function audit(tx: Tx, officeId: number, eventType: string, id: string, userId?: string) {
    await recordCriticalEvent(tx, { officeId, ...(userId ? { user: { id: userId }, actorType: 'USER' as const } : { actorType: 'SYSTEM' as const }), source: 'INTERNAL' }, {
      eventType, module: 'security', recordType: 'SigningDevice', recordId: id, metadata: { entityId: id },
    })
  }
  async function authenticated(tx: Tx, token: string, now: Date, role?: 'signer' | 'receiver') {
    Secret.parse(token)
    const session = await tx.deviceSession.findUnique({ where: { tokenHash: sha256(token) }, include: { device: true } })
    if (!session || session.expiresAt <= now || session.device.revokedAt) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
    if (role && !(role === 'signer' ? signerRoles : receiverRoles).includes(session.device.role)) throw new DeviceError('DEVICE_ROLE_FORBIDDEN')
    return session.device
  }
  async function sessionOffice(token: string) {
    Secret.parse(token)
    const row = await db.deviceSession.findUnique({ where: { tokenHash: sha256(token) }, select: { officeId: true } })
    if (!row) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
    return row.officeId
  }
  async function withDevice<T>(token: string, role: 'signer' | 'receiver' | undefined, fn: (tx: Tx, device: Awaited<ReturnType<typeof authenticated>>, now: Date) => Promise<T>) {
    return transaction(await sessionOffice(token), async (tx, now) => fn(tx, await authenticated(tx, token, now, role), now))
  }
  async function validLease(tx: Tx, device: { id: string; officeId: number }, raw: unknown, now: Date) {
    const lease = DeviceLease.parse(raw)
    const item = await tx.signingItem.findFirst({ where: { id: lease.itemId, officeId: device.officeId, leaseOwner: device.id,
      leaseToken: lease.leaseToken, leaseExpiresAt: { gt: now }, status: { in: ['CLAIMED', 'SIGNING'] } } })
    if (!item) throw new DeviceError('STALE_LEASE', 409)
    return item
  }
  // Committed separately so failed operations cannot roll back their counters.
  async function throttle(scope: string, identity: string, limit: number) {
    const key = sha256(`${scope}:${identity}`)
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO device_rate_limits (key, "windowAt", count) VALUES (${key}, date_trunc('minute', clock_timestamp()), 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN device_rate_limits."windowAt" = date_trunc('minute', clock_timestamp()) THEN device_rate_limits.count + 1 ELSE 1 END,
        "windowAt" = date_trunc('minute', clock_timestamp()) RETURNING count`
    if (rows[0].count > limit) throw new DeviceError('RATE_LIMITED', 429)
  }
  const artifacts = createArtifactService(db, authenticated, artifactDependencies)
  const deliveries = createDeliveryService(db, authenticated, artifactDependencies.storage ?? signingStorage)
  const folder = createOfficeFolderService(db, authenticated, artifactDependencies.storage)
  return {
    officeFolder: folder.list,
    officeFolderDownload: folder.download,
    pendingDeliveries: deliveries.pending,
    beginDelivery: deliveries.begin,
    downloadDelivery: deliveries.download,
    failDelivery: deliveries.fail,
    download: artifacts.download,
    submitArtifact: artifacts.submit,
    authorizeUpload: artifacts.authorizeUpload,
    cleanupArtifacts: artifacts.cleanup,
    // DB-backed fixed windows work across processes. Counts commit even when the
    // subsequent authentication/operation fails. Keys contain hashes, never secrets.
    throttle,
    async retire(raw: unknown) {
      const input = z.object({ deviceId: DeviceId, signature: z.string().max(1024) }).strict().parse(raw)
      const device = await db.signingDevice.findUnique({ where: { id: input.deviceId } })
      const message = `NOTIFICA-DEVICE-RETIRE-V1\n${input.deviceId}`
      if (!device?.publicKey || !verifyProof(device.publicKey, message, input.signature)) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
      return transaction(device.officeId, async (tx, now) => {
        const current = await tx.signingDevice.findUniqueOrThrow({ where: { id: device.id } })
        if (!current.publicKey || !verifyProof(current.publicKey, message, input.signature)) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
        if (!current.revokedAt) {
          await tx.signingDevice.update({ where: { id: device.id }, data: { revokedAt: now, health: 'OFFLINE' } })
          await tx.deviceSession.deleteMany({ where: { deviceId: device.id } })
          await tx.deviceChallenge.deleteMany({ where: { deviceId: device.id } })
          await audit(tx, device.officeId, 'device.revoked', device.id)
        }
        // Purpose-bound proof can replay retirement, never enrollment or signing.
        return { deviceId: device.id, revoked: true }
      })
    },
    async limitAuthenticated(token: string, action: string) {
      const id = await withDevice(token, undefined, async (_tx, device) => device.id)
      // A new session does not reset the device's health/claim allowance.
      // Catalog pages carry metadata only. A busy office can have many pages;
      // it must not be permanently unable to finish a 50-day snapshot.
      await throttle(`device:${action}`, id, action === 'heartbeat' ? 6 : action === 'office-folder' ? 600 : 60)
    },
    async createEnrollment(context: SigningContext, raw: unknown) {
      const input = z.object({ role: Role }).strict().parse(raw)
      return transaction(context.officeId, async (tx, now) => {
        await admin(tx, context)
        const code = secret()
        const enrollment = await tx.deviceEnrollment.create({ data: { officeId: context.officeId, role: input.role,
          createdByUserId: context.userId, secretHash: sha256(code), expiresAt: new Date(now.getTime() + 10 * 60_000) } })
        await audit(tx, context.officeId, 'device.enrollment_created', enrollment.id, context.userId)
        return { enrollmentId: enrollment.id, code, expiresAt: enrollment.expiresAt, role: enrollment.role }
      })
    },
    async revokeEnrollment(context: SigningContext, id: string) {
      DeviceId.parse(id)
      return transaction(context.officeId, async (tx, now) => {
        await admin(tx, context)
        const row = await tx.deviceEnrollment.findFirst({ where: { id, officeId: context.officeId } })
        if (!row) throw new DeviceError('NOT_FOUND', 404)
        await tx.deviceEnrollment.update({ where: { id }, data: { revokedAt: now } })
        await audit(tx, context.officeId, 'device.enrollment_revoked', id, context.userId)
        return { revoked: true }
      })
    },
    async enroll(raw: unknown) {
      const input = Enroll.parse(raw)
      const key = publicIdentity(input.publicKey)
      if (!verifyProof(key, enrollmentMessage(input.code, key, input.name), input.signature)) throw new DeviceError('ENROLLMENT_INVALID', 401)
      const enrollment = await db.deviceEnrollment.findUnique({ where: { secretHash: sha256(input.code) } })
      if (!enrollment) throw new DeviceError('ENROLLMENT_INVALID', 401)
      return transaction(enrollment.officeId, async (tx, now) => {
        const available = await tx.deviceEnrollment.findFirst({ where: { id: enrollment.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } } })
        if (!available) throw new DeviceError('ENROLLMENT_INVALID', 401)
        // Revoking the creating administrator also invalidates outstanding codes.
        await admin(tx, { officeId: enrollment.officeId, userId: enrollment.createdByUserId })
        const device = await tx.signingDevice.create({ data: { officeId: enrollment.officeId, name: input.name, role: enrollment.role, publicKey: key } })
        // The existing CHECK requires consumedAt and deviceId together.
        const consumed = await tx.deviceEnrollment.updateMany({ where: { id: enrollment.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now, deviceId: device.id } })
        if (consumed.count !== 1) throw new DeviceError('ENROLLMENT_INVALID', 401)
        await audit(tx, device.officeId, 'device.enrolled', device.id)
        // Enrollment reads the office catalog; no per-device PDF fan-out/backfill.
        return { deviceId: device.id, officeId: device.officeId, role: device.role }
      })
    },
    async challenge(raw: unknown) {
      const { deviceId } = z.object({ deviceId: DeviceId }).strict().parse(raw)
      const device = await db.signingDevice.findFirst({ where: { id: deviceId, revokedAt: null, publicKey: { not: null } } })
      if (!device) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
      return transaction(device.officeId, async (tx, now) => {
        if (!await tx.signingDevice.findFirst({ where: { id: deviceId, revokedAt: null } })) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
        await tx.deviceChallenge.deleteMany({ where: { deviceId, OR: [{ expiresAt: { lte: now } }, { consumedAt: { not: null } }] } })
        const nonce = secret()
        const challenge = await tx.deviceChallenge.create({ data: { deviceId, officeId: device.officeId, nonceHash: sha256(nonce), expiresAt: new Date(now.getTime() + 60_000) } })
        return { challengeId: challenge.id, nonce, expiresAt: challenge.expiresAt }
      })
    },
    async session(raw: unknown) {
      const input = SessionProof.parse(raw)
      const device = await db.signingDevice.findFirst({ where: { id: input.deviceId, revokedAt: null } })
      if (!device) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
      return transaction(device.officeId, async (tx, now) => {
        const current = await tx.signingDevice.findFirst({ where: { id: device.id, revokedAt: null } })
        if (!current?.publicKey || !verifyProof(current.publicKey, sessionMessage(device.id, input.challengeId, input.nonce), input.signature)) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
        const used = await tx.deviceChallenge.updateMany({ where: { id: input.challengeId, deviceId: device.id, officeId: device.officeId,
          nonceHash: sha256(input.nonce), consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })
        if (used.count !== 1) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
        await tx.deviceSession.deleteMany({ where: { deviceId: device.id, expiresAt: { lte: now } } })
        const token = secret()
        const session = await tx.deviceSession.create({ data: { deviceId: device.id, officeId: device.officeId, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + sessionMs) } })
        return { token, expiresAt: session.expiresAt }
      })
    },
    async list(context: SigningContext) {
      return transaction(context.officeId, async (tx, now) => {
        await admin(tx, context)
        const devices = await tx.signingDevice.findMany({ where: { officeId: context.officeId }, orderBy: { createdAt: 'desc' }, take: 500,
          select: { id: true, name: true, role: true, health: true, agentVersion: true, certificateThumbprint: true,
            certificateSubject: true, certificateIssuer: true, certificateExpiresAt: true, lastHeartbeatAt: true,
            revokedAt: true, diskFreeBytes: true, healthErrorCode: true, lastSuccessfulContactAt: true } })
        return devices.map(d => ({ ...d, diskFreeBytes: d.diskFreeBytes?.toString() ?? null,
          health: d.revokedAt || !d.lastHeartbeatAt || now.getTime() - d.lastHeartbeatAt.getTime() > staleMs ? 'OFFLINE' : d.health }))
      })
    },
    async revoke(context: SigningContext, id: string) {
      DeviceId.parse(id)
      return transaction(context.officeId, async (tx, now) => {
        await admin(tx, context)
        const device = await tx.signingDevice.findFirst({ where: { id, officeId: context.officeId } })
        if (!device) throw new DeviceError('NOT_FOUND', 404)
        if (!device.revokedAt) {
          await tx.signingDevice.update({ where: { id }, data: { revokedAt: now, health: 'OFFLINE' } })
          await tx.deviceSession.deleteMany({ where: { deviceId: id } })
          await tx.deviceChallenge.deleteMany({ where: { deviceId: id } })
          await audit(tx, context.officeId, 'device.revoked', id, context.userId)
        }
        return { revoked: true }
      })
    },
    async heartbeat(token: string, raw: unknown) {
      const report = Heartbeat.parse(raw)
      return withDevice(token, undefined, async (tx, device, now) => {
        if (report.role !== device.role) throw new DeviceError('DEVICE_ROLE_FORBIDDEN')
        if (report.lastSuccessfulContactAt && new Date(report.lastSuccessfulContactAt).getTime() > now.getTime() + 60_000) throw new DeviceError('INVALID_CONTACT_TIME', 400)
        const health = observedHealth(report, now)
        const healthErrorCode = report.operationalError ?? (report.token === 'READY' ? health === 'CERT_EXPIRED' ? 'CERT_EXPIRED' : health === 'DRIVER_ERROR' ? 'CERT_INVALID' : null : report.token === 'NOT_APPLICABLE' ? null : report.token)
        await tx.signingDevice.update({ where: { id: device.id }, data: {
          health, agentVersion: report.agentVersion, lastHeartbeatAt: now, diskFreeBytes: BigInt(report.diskFreeBytes),
          lastSuccessfulContactAt: report.lastSuccessfulContactAt ? new Date(report.lastSuccessfulContactAt) : null,
          healthErrorCode,
          certificateThumbprint: report.certificate?.fingerprint ?? null, certificateSubject: report.certificate?.subject ?? null,
          certificateIssuer: report.certificate?.issuer ?? null, certificateExpiresAt: report.certificate ? new Date(report.certificate.expiresAt) : null,
          providerType: report.certificate ? 'PKCS11' : null,
        } })
        if (device.health !== health || healthErrorCode !== device.healthErrorCode) await audit(tx, device.officeId, 'device.health_changed', device.id)
        return { health, serverTime: now, heartbeatAfterSeconds: 30 }
      })
    },
    async queue(token: string, action: 'claim' | 'renew' | 'release' | 'fail' | 'start', raw: unknown) {
      const officeId = await sessionOffice(token)
      const identity = await withDevice(token, 'signer', async (_tx, device) => device)
      // Recheck session and revocation inside the queue's existing office lock.
      const queue = createSigningService(db, async (tx, targetOffice, targetDevice, now) => {
        const d = await authenticated(tx, token, now, 'signer')
        if (action === 'claim' || action === 'start') requireSupportedAgent(d.agentVersion)
        if (d.id !== targetDevice || d.officeId !== targetOffice) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
        if (action === 'claim' && (!d.lastHeartbeatAt || now.getTime() - d.lastHeartbeatAt.getTime() > staleMs)) throw new DeviceError('DEVICE_OFFLINE', 409)
      })
      if (action === 'claim') {
        z.object({}).strict().parse(raw)
        try { await artifacts.cleanup(officeId) } catch { console.warn('SIGNING_ARTIFACT_CLEANUP_PENDING') }
        const item = await queue.claim(officeId, identity.id)
        if (!item) return null
        return { itemId: item.id, leaseToken: item.leaseToken, leaseExpiresAt: item.leaseExpiresAt, sourceVersionId: item.sourceVersionId, sourceChecksum: item.sourceChecksum }
      }
      const input = (action === 'fail' ? DeviceLease.extend({ errorCode: SigningFailureCode }).strict() :
        action === 'start' ? DeviceLease.extend({ locallyApproved: z.literal(true).optional(), remoteSessionId: z.string().uuid().optional(), batchId: z.string().uuid().optional() })
          .strict().refine(v => !(v.locallyApproved && v.remoteSessionId), 'Conflicting authorization modes') : DeviceLease).parse(raw)
      const lease = { officeId, deviceId: identity.id, itemId: input.itemId, leaseToken: input.leaseToken }
      if (action === 'renew') return { leaseExpiresAt: (await queue.renew(lease)).leaseExpiresAt }
      if (action === 'start') {
        if (!artifacts.ready()) throw new DeviceError('VALIDATOR_NOT_CONFIGURED', 503)
        await queue.start(lease, 'locallyApproved' in input && input.locallyApproved === true,
          'batchId' in input && typeof input.batchId === 'string' ? input.batchId : undefined,
          'remoteSessionId' in input && typeof input.remoteSessionId === 'string' ? input.remoteSessionId : undefined); return { accepted: true }
      }
      if (action === 'release') await queue.release(lease)
      else await queue.fail(lease, 'errorCode' in input ? input.errorCode : 'UNKNOWN')
      return { accepted: true }
    },
    async recovery(token: string, raw: unknown) {
      const lease = DeviceLease.parse(raw)
      return withDevice(token, 'signer', async (tx, device) => {
        const attempt = await tx.signingAttempt.findFirst({ where: { officeId: device.officeId, deviceId: device.id,
          itemId: lease.itemId, leaseToken: lease.leaseToken }, include: { item: { include: { signature: true } } } })
        if (!attempt) throw new DeviceError('STALE_LEASE', 409)
        if (attempt.item.signature && attempt.result === 'SUCCEEDED') return { released: false, committed: true, checksumSha256: attempt.item.signature.signedChecksum }
        if (attempt.result === 'RUNNING' || attempt.item.signature) return { released: false }
        const started = await tx.activityEvent.count({ where: { officeId: device.officeId,
          eventType: 'signing.started', recordType: 'SigningItem', recordId: lease.itemId,
          metadata: { path: ['attemptNumber'], equals: attempt.attemptNumber } } })
        const reviewed = await tx.activityEvent.count({ where: { officeId: device.officeId,
          eventType: 'signing.retried', recordType: 'SigningItem', recordId: lease.itemId,
          AND: [{ metadata: { path: ['attemptNumber'], equals: attempt.attemptNumber } }, { metadata: { path: ['reviewed'], equals: true } }],
        } })
        const knownRetry = attempt.result === 'RETRYABLE_FAILURE' && ['TSA_UNAVAILABLE', 'REVOCATION_UNAVAILABLE'].includes(attempt.errorCode ?? '')
        return { released: !started || reviewed > 0 || knownRetry }
      })
    },
    async input(token: string, raw: unknown) {
      return artifacts.metadata(token, raw)
    },
    async result(token: string, raw: unknown) {
      return withDevice(token, 'signer', async (tx, device, now) => {
        // Never accept a device's assertion that its PDF has been validated.
        await validLease(tx, device, raw, now)
        throw new DeviceError('PDF_BODY_REQUIRED', 415)
      })
    },
    async acknowledge(token: string, raw: unknown) {
      const input = z.object({ deliveryId: DeviceId, checksumSha256: Certificate.shape.fingerprint }).strict().parse(raw)
      return withDevice(token, 'receiver', async (tx, device, now) => {
        const row = await tx.documentDelivery.findFirst({ where: { id: input.deliveryId, officeId: device.officeId, deviceId: device.id }, include: { signature: true } })
        if (!row) throw new DeviceError('NOT_FOUND', 404)
        if (row.signature.signedChecksum !== input.checksumSha256 || !['DOWNLOADING', 'DELIVERED'].includes(row.status)) throw new DeviceError('DELIVERY_CONFLICT', 409)
        if (row.status !== 'DELIVERED') {
          await tx.documentDelivery.update({ where: { id: row.id }, data: { status: 'DELIVERED', deliveredAt: now, errorCode: null, safeError: null } })
          await audit(tx, device.officeId, 'device.delivery_acknowledged', row.id)
        }
        return { delivered: true }
      })
    },
  }
}
