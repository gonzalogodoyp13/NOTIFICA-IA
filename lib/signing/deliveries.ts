import 'server-only'
import { type Prisma, type PrismaClient, type SigningDevice } from '@prisma/client'
import { z } from 'zod'
import { recordCriticalEvent } from '../audit/activityEvent'
import { DeviceError, DeviceId, Hash, Secret, sha256 } from './deviceProtocol'
import { lockSigningOffice } from './transaction'
import type { SigningStorage } from './artifacts'
import { MAX_SIGNING_PDF } from './pdfValidator'

const receiverRoles = ['RECEIVER', 'SIGNER_RECEIVER'] as const
export async function scheduleSignatureDeliveries(tx: Prisma.TransactionClient, officeId: number, signatureId: string) {
  const devices = await tx.signingDevice.findMany({ where: { officeId, revokedAt: null, role: { in: [...receiverRoles] } }, select: { id: true } })
  if (devices.length) await tx.documentDelivery.createMany({ data: devices.map(d => ({ officeId, signatureId, deviceId: d.id })), skipDuplicates: true })
}
export async function seedReceiverDeliveries(tx: Prisma.TransactionClient, device: SigningDevice) {
  if (!receiverRoles.includes(device.role as typeof receiverRoles[number])) return
  // Only server-validated, committed artifacts qualify. A queue success assertion alone does not.
  const signatures = await tx.documentSignature.findMany({ where: { officeId: device.officeId,
    item: { artifacts: { some: { state: 'COMMITTED' } } } }, select: { id: true } })
  for (let offset = 0; offset < signatures.length; offset += 500) {
    await tx.documentDelivery.createMany({ data: signatures.slice(offset, offset + 500).map(s => ({
      officeId: device.officeId, signatureId: s.id, deviceId: device.id })), skipDuplicates: true })
  }
}
const DeliveryRequest = z.object({ deliveryId: DeviceId, checksumSha256: Hash }).strict()
const errors = {
  NETWORK: 'Transferencia interrumpida. Se volverá a intentar.',
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
      eventType, module: 'security', recordType: 'DocumentDelivery', recordId: deliveryId, metadata: { entityId: deliveryId } })
  }
  return {
    async begin(token: string, raw: unknown) {
      const input = DeliveryRequest.parse(raw)
      return transaction(token, async (tx, device, now) => {
        const row = await access(tx, device, input)
        if (row.status !== 'DELIVERED') {
          if (row.availableAt > now) throw new DeviceError('DELIVERY_NOT_READY', 409)
          await tx.documentDelivery.update({ where: { id: row.id }, data: { status: 'DOWNLOADING', attemptCount: { increment: 1 } } })
        }
        return { authorized: true }
      })
    },
    async pending(token: string, raw: unknown) {
      const input = z.object({ cursor: DeviceId.nullable().optional() }).strict().parse(raw)
      return transaction(token, async (tx, device, now) => {
        const rows = await tx.documentDelivery.findMany({ where: { officeId: device.officeId, deviceId: device.id,
          status: { in: ['PENDING', 'DOWNLOADING', 'FAILED'] }, availableAt: { lte: now }, ...(input.cursor ? { id: { gt: input.cursor } } : {}) },
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
        if (row.status !== 'DELIVERED') {
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
      const input = DeliveryRequest.extend({ errorCode: z.enum(['NETWORK', 'DISK', 'CHECKSUM_MISMATCH', 'LOCAL_CONFLICT', 'UNKNOWN']) }).strict().parse(raw)
      return transaction(token, async (tx, device, now) => {
        const row = await access(tx, device, input)
        if (row.status === 'DELIVERED') return { accepted: true }
        await tx.documentDelivery.update({ where: { id: row.id }, data: { status: 'FAILED', errorCode: input.errorCode,
          safeError: errors[input.errorCode], availableAt: new Date(now.getTime() + Math.min(3600000, 30000 * 2 ** Math.min(row.attemptCount, 7))) } })
        await audit(tx, device.officeId, 'device.delivery_failed', row.id)
        return { accepted: true }
      })
    },
  }
}
