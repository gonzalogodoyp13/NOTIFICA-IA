import 'server-only'
import { type Prisma, type PrismaClient, type SigningDevice } from '@prisma/client'
import { z } from 'zod'
import { recordCriticalEvent } from '../audit/activityEvent'
import { DeviceError, DeviceId, Hash, Secret, sha256 } from './deviceProtocol'
import { lockSigningOffice } from './transaction'
import type { SigningStorage } from './artifacts'
import { MAX_SIGNING_PDF } from './pdfValidator'
import { deliveryCanRetry, deliveryDelayMs, DELIVERY_ATTEMPT_LIMIT } from './operationsPolicy'
import { requireSupportedAgent } from './agentRelease'

// Compatibility for pre-upgrade transfers only. New signatures and enrollments
// are represented by the office catalog and never create delivery rows.
const DeliveryRequest = z.object({ deliveryId: DeviceId, checksumSha256: Hash }).strict()
export const deliveryErrors = {
  NETWORK: 'Transferencia interrumpida. Se volverá a intentar.',
  STORAGE: 'El almacenamiento no está disponible. Se volverá a intentar.',
  DISK: 'Revisa el espacio y los permisos de la carpeta receptora.',
  CHECKSUM_MISMATCH: 'El archivo recibido no coincide con la firma validada.',
  LOCAL_CONFLICT: 'Hay un archivo local diferente; se conservará.',
  UNKNOWN: 'No se pudo completar la copia local. Revisa el equipo receptor.',
}
type Authenticate = (tx: Prisma.TransactionClient, token: string, now: Date, role: 'receiver') => Promise<SigningDevice>
export function createDeliveryService(db: PrismaClient, authenticate: Authenticate, store: SigningStorage) {
  async function transaction<T>(token: string, run: (tx: Prisma.TransactionClient, device: SigningDevice, now: Date) => Promise<T>) {
    Secret.parse(token)
    const session = await db.deviceSession.findUnique({ where: { tokenHash: sha256(token) }, select: { officeId: true } })
    if (!session) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
    return db.$transaction(async tx => {
      const now = await lockSigningOffice(tx, session.officeId)
      return run(tx, await authenticate(tx, token, now, 'receiver'), now)
    }, { timeout: 30_000, maxWait: 15_000 })
  }
  async function access(tx: Prisma.TransactionClient, device: SigningDevice, input: z.infer<typeof DeliveryRequest>) {
    const row = await tx.documentDelivery.findFirst({ where: { id: input.deliveryId, officeId: device.officeId, deviceId: device.id },
      include: { signature: { include: { signedVersion: true, item: { select: { artifacts: { where: { state: 'COMMITTED' }, select: { id: true } } } } } } } })
    if (!row) throw new DeviceError('NOT_FOUND', 404)
    const v = row.signature.signedVersion
    if (row.status === 'CANCELLED' || row.signature.signedChecksum !== input.checksumSha256 ||
      v.checksumSha256 !== input.checksumSha256 || v.officeId !== device.officeId || v.deletedAt ||
      !row.signature.item.artifacts.some(a => a.id === v.id) || v.sizeBytes > MAX_SIGNING_PDF || v.mimeType !== 'application/pdf')
      throw new DeviceError('DELIVERY_CONFLICT', 409)
    return row
  }
  async function audit(tx: Prisma.TransactionClient, officeId: number, eventType: string, deliveryId: string) {
    await recordCriticalEvent(tx, { officeId, actorType: 'SYSTEM', source: 'INTERNAL' }, {
      eventType, module: 'security', recordType: 'DocumentDelivery', recordId: deliveryId, metadata: { entityId: deliveryId },
      result: eventType === 'device.delivery_failed' ? 'failure' : 'success' })
  }
  return {
    async begin(token: string, raw: unknown) {
      const input = DeliveryRequest.parse(raw)
      return transaction(token, async (tx, device, now) => {
        const row = await access(tx, device, input)
        if (!['DOWNLOADING', 'DELIVERED'].includes(row.status)) throw new DeviceError('DELIVERY_RETIRED', 410)
        if (row.status !== 'DELIVERED') {
          if (row.status !== 'DOWNLOADING') requireSupportedAgent(device.agentVersion)
          if (row.status !== 'DOWNLOADING' && !deliveryCanRetry(row.errorCode, row.attemptCount)) throw new DeviceError('DELIVERY_OPERATOR_REQUIRED', 409)
          if (row.availableAt > now) throw new DeviceError('DELIVERY_NOT_READY', 409)
          if (row.status !== 'DOWNLOADING') {
            await tx.documentDelivery.update({ where: { id: row.id }, data: { status: 'DOWNLOADING', attemptCount: { increment: 1 } } })
            await audit(tx, device.officeId, 'device.delivery_started', row.id)
          }
        }
        return { authorized: true }
      })
    },
    async pending(token: string, raw: unknown) {
      const input = z.object({ cursor: DeviceId.nullable().optional() }).strict().parse(raw)
      return transaction(token, async (tx, device, now) => {
        const rows = await tx.documentDelivery.findMany({ where: { officeId: device.officeId, deviceId: device.id,
          // Drain only transfers already started before the shared-folder upgrade.
          status: 'DOWNLOADING', availableAt: { lte: now },
          OR: [{ status: 'DOWNLOADING' }, { attemptCount: { lt: DELIVERY_ATTEMPT_LIMIT }, OR: [{ errorCode: null }, { errorCode: { in: ['NETWORK', 'STORAGE'] } }] }],
          ...(input.cursor ? { id: { gt: input.cursor } } : {}) },
          orderBy: { id: 'asc' }, take: 20, include: { signature: { include: { signedVersion: true } } } })
        // An exhausted scan wraps. Concurrent inserts or delayed failures below the cursor cannot be lost.
        return { nextCursor: rows.at(-1)?.id ?? null, deliveries: rows.map(row => ({ deliveryId: row.id,
          documentId: row.signature.documentoId, signedVersionId: row.signature.signedVersionId,
          checksumSha256: row.signature.signedChecksum, sizeBytes: row.signature.signedVersion.sizeBytes })) }
      })
    },
    async download(token: string, raw: unknown) {
      const input = DeliveryRequest.parse(raw)
      const row = await transaction(token, async (tx, device, now) => {
        const row = await access(tx, device, input)
        if (!['DOWNLOADING', 'DELIVERED'].includes(row.status)) throw new DeviceError('DELIVERY_RETIRED', 410)
        if (row.status !== 'DELIVERED') {
          if (row.status !== 'DOWNLOADING' && !deliveryCanRetry(row.errorCode, row.attemptCount)) throw new DeviceError('DELIVERY_OPERATOR_REQUIRED', 409)
          if (row.availableAt > now) throw new DeviceError('DELIVERY_NOT_READY', 409)
          if (row.status !== 'DOWNLOADING') await tx.documentDelivery.update({ where: { id: row.id }, data: { status: 'DOWNLOADING', attemptCount: { increment: 1 } } })
        }
        return row
      })
      const v = row.signature.signedVersion
      await store.assertPrivate(v.storageBucket)
      const bytes = await store.download(v.storageBucket, v.storageKey)
      if (bytes.length !== v.sizeBytes || sha256(bytes) !== input.checksumSha256 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new DeviceError('CHECKSUM_MISMATCH', 409)
      await transaction(token, async (tx, device) => { await access(tx, device, input) })
      return bytes
    },
    async fail(token: string, raw: unknown) {
      const input = DeliveryRequest.extend({ errorCode: z.enum(['NETWORK', 'STORAGE', 'DISK', 'CHECKSUM_MISMATCH', 'LOCAL_CONFLICT', 'UNKNOWN']) }).strict().parse(raw)
      return transaction(token, async (tx, device, now) => {
        const row = await access(tx, device, input)
        if (row.status === 'DELIVERED') return { accepted: true }
        if (row.status === 'FAILED') return { accepted: true } // Lost-response replay must not extend backoff.
        await tx.documentDelivery.update({ where: { id: row.id }, data: { status: 'FAILED', errorCode: input.errorCode,
          safeError: deliveryErrors[input.errorCode], availableAt: new Date(now.getTime() + deliveryDelayMs(row.attemptCount)) } })
        await recordCriticalEvent(tx, { officeId: device.officeId, actorType: 'SYSTEM', source: 'INTERNAL' }, {
          eventType: 'device.delivery_failed', module: 'security', recordType: 'DocumentDelivery', recordId: row.id, result: 'failure',
          metadata: { entityId: row.id, deviceId: device.id, attemptNumber: row.attemptCount, errorCode: input.errorCode } })
        return { accepted: true }
      })
    },
  }
}
