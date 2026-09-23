import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient, type SigningDevice } from '@prisma/client'
import { createServerSupabaseStorageClient } from '../supabaseServer'
import { assertEligibleVersion, SigningError, SupportedSigningLevel } from './core'
import { DeviceError, DeviceLease, Secret, sha256 } from './deviceProtocol'
import { lockSigningOffice } from './transaction'
import { createSigningService } from './service'
import { MAX_SIGNING_PDF, type PdfValidator, validateSigningPdf, ValidationReport } from './pdfValidator'

export interface SigningStorage {
  assertPrivate(bucket: string): Promise<void>
  download(bucket: string, key: string): Promise<Buffer>
  upload(bucket: string, key: string, bytes: Buffer): Promise<void>
  remove(bucket: string, key: string): Promise<void>
}
export const signingStorage: SigningStorage = {
  async assertPrivate(bucket) {
    const { data, error } = await createServerSupabaseStorageClient({ requireServiceRole: true, timeoutMs: 60_000 }).storage.getBucket(bucket)
    if (error || !data || data.public) throw new SigningError('PRIVATE_STORAGE_REQUIRED')
  },
  async download(bucket, key) {
    const { data, error } = await createServerSupabaseStorageClient({ requireServiceRole: true, timeoutMs: 60_000 }).storage.from(bucket).download(key)
    if (error || !data || data.size > MAX_SIGNING_PDF) throw new SigningError('STORAGE')
    return Buffer.from(await data.arrayBuffer())
  },
  async upload(bucket, key, bytes) {
    const { error } = await createServerSupabaseStorageClient({ requireServiceRole: true, timeoutMs: 60_000 }).storage.from(bucket)
      .upload(key, bytes, { contentType: 'application/pdf', upsert: false })
    if (error) throw new SigningError('STORAGE')
  },
  async remove(bucket, key) {
    const { error } = await createServerSupabaseStorageClient({ requireServiceRole: true, timeoutMs: 60_000 }).storage.from(bucket).remove([key])
    if (error) throw new SigningError('STORAGE')
  },
}
export type ArtifactDependencies = { storage?: SigningStorage; validator?: PdfValidator }
type Authenticate = (tx: Prisma.TransactionClient, token: string, now: Date, role: 'signer') => Promise<SigningDevice>
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function pdf(bytes: Buffer) {
  if (bytes.length < 8 || bytes.length > MAX_SIGNING_PDF || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new SigningError('INVALID_PDF')
}

export function createArtifactService(db: PrismaClient, authenticate: Authenticate, dependencies: ArtifactDependencies = {}) {
  const store = dependencies.storage ?? signingStorage, validate = dependencies.validator ?? validateSigningPdf
  const ready = () => Boolean(dependencies.validator || process.env.SIGNING_VALIDATOR_CONFIG ||
    (process.env.SIGNING_VALIDATOR_URL && process.env.SIGNING_VALIDATOR_TOKEN))
  async function transaction<T>(officeId: number, run: (tx: Prisma.TransactionClient, now: Date) => Promise<T>) {
    return db.$transaction(async tx => run(tx, await lockSigningOffice(tx, officeId)), { timeout: 30_000, maxWait: 15_000 })
  }
  async function access(token: string, raw: unknown, signedChecksum?: string, replay = false) {
    Secret.parse(token)
    const lease = DeviceLease.parse(raw)
    const session = await db.deviceSession.findUnique({ where: { tokenHash: sha256(token) }, select: { officeId: true } })
    if (!session) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
    return transaction(session.officeId, async (tx, now) => {
      const device = await authenticate(tx, token, now, 'signer')
      const item = await tx.signingItem.findFirst({ where: { id: lease.itemId, officeId: device.officeId },
        include: { job: { include: { requestedBy: true, office: true } }, sourceVersion: { include: { documento: true } }, signature: true } })
      if (!item) throw new SigningError('STALE_LEASE')
      const boundLease = { ...lease, officeId: device.officeId, deviceId: device.id }
      if (item.signature && (signedChecksum || replay)) {
        const attempt = await tx.signingAttempt.findFirst({ where: { itemId: item.id, officeId: device.officeId,
          deviceId: device.id, leaseToken: lease.leaseToken, result: 'SUCCEEDED' } })
        if (!attempt || (signedChecksum && item.signature.signedChecksum !== signedChecksum)) throw new SigningError('RESULT_CONFLICT')
        return { item, lease: boundLease, prior: item.signature }
      }
      if (item.leaseOwner !== device.id || item.leaseToken !== lease.leaseToken || !item.leaseExpiresAt || item.leaseExpiresAt <= now ||
        !['CLAIMED', 'SIGNING'].includes(item.status)) throw new SigningError('STALE_LEASE')
      assertEligibleVersion(item.sourceVersion, device.officeId)
      if (item.sourceVersion.checksumSha256 !== item.sourceChecksum) throw new SigningError('CHECKSUM_MISMATCH')
      return { item, lease: boundLease, prior: null }
    })
  }
  async function sourceBytes(item: Awaited<ReturnType<typeof access>>['item']) {
    const source = item.sourceVersion
    if (source.sizeBytes > MAX_SIGNING_PDF) throw new SigningError('INVALID_PDF')
    await store.assertPrivate(source.storageBucket)
    const bytes = await store.download(source.storageBucket, source.storageKey)
    pdf(bytes)
    if (bytes.length !== source.sizeBytes || digest(bytes) !== item.sourceChecksum) throw new SigningError('CHECKSUM_MISMATCH')
    return bytes
  }
  const publicResult = (signature: { id: string; signedVersionId: string; signedChecksum: string }) => ({
    committed: true, signatureId: signature.id, signedVersionId: signature.signedVersionId, checksumSha256: signature.signedChecksum,
  })
  return {
    ready,
    async authorizeUpload(token: string, raw: unknown) {
      const context = await access(token, raw, undefined, true)
      if (!context.prior && context.item.status !== 'SIGNING') throw new SigningError('SIGNING_NOT_STARTED')
    },
    async metadata(token: string, raw: unknown) {
      const { item, lease } = await access(token, raw)
      return { authorized: true, transferAvailable: ready(), sourceVersionId: item.sourceVersionId,
        checksumSha256: item.sourceChecksum, sizeBytes: item.sourceVersion.sizeBytes, expiresAt: item.leaseExpiresAt,
        documentoId: item.documentoId, officeId: lease.officeId, officeName: item.job.office.nombre,
        requester: item.job.requestedBy.email, signerFingerprint: item.signerFingerprint,
        requestedLevel: item.job.requestedLevel }
    },
    async download(token: string, raw: unknown) {
      const { item } = await access(token, raw)
      const bytes = await sourceBytes(item)
      await access(token, raw) // Recheck lease/session/revocation after storage I/O.
      return bytes
    },
    async submit(token: string, raw: unknown, bytes: Buffer) {
      pdf(bytes)
      const checksum = digest(bytes)
      const initial = await access(token, raw, checksum)
      if (initial.prior) return publicResult(initial.prior)
      if (initial.item.status !== 'SIGNING') throw new SigningError('SIGNING_NOT_STARTED')
      const source = await sourceBytes(initial.item)
      const report = ValidationReport.parse(await validate({ source, signed: bytes, sourceChecksum: initial.item.sourceChecksum,
        signerFingerprint: initial.item.signerFingerprint, requestedLevel: SupportedSigningLevel.parse(initial.item.job.requestedLevel) }))
      if (report.sourceChecksum !== initial.item.sourceChecksum || report.signedChecksum !== checksum || report.signerFingerprint !== initial.item.signerFingerprint)
        throw new SigningError('INVALID_EVIDENCE')
      const current = await access(token, raw, checksum)
      if (current.prior) return publicResult(current.prior)
      const id = randomUUID(), bucket = current.item.sourceVersion.storageBucket
      const key = `offices/${current.lease.officeId}/signing/${current.item.id}/${id}.pdf`
      // Reserve before I/O. A crashed request leaves a durable cleanup candidate.
      await transaction(current.lease.officeId, async (tx, now) => {
        await authenticate(tx, token, now, 'signer')
        await tx.signingArtifact.create({ data: { id, officeId: current.lease.officeId, itemId: current.item.id,
          deviceId: current.lease.deviceId, leaseToken: current.lease.leaseToken, storageBucket: bucket, storageKey: key,
          checksumSha256: checksum, sizeBytes: bytes.length, expiresAt: new Date(now.getTime() + 2 * 60 * 60_000) } })
      })
      await store.assertPrivate(bucket)
      await store.upload(bucket, key, bytes)
      // Verify the bytes retained by storage as well as the incoming request.
      const retained = await store.download(bucket, key)
      if (retained.length !== bytes.length || digest(retained) !== checksum) throw new SigningError('CHECKSUM_MISMATCH')
      const queue = createSigningService(db, async (tx, office, device, now) => {
        const actor = await authenticate(tx, token, now, 'signer')
        if (actor.officeId !== office || actor.id !== device) throw new SigningError('FORBIDDEN')
      })
      // The version, evidence, attempt, current pointer, upload and audit commit
      // together. A stale worker can never promote an artifact after reassignment.
      try {
        const signature = await queue.complete(current.lease, { signedVersionId: id, signedChecksum: checksum,
          signerFingerprint: report.signerFingerprint, certificateIssuer: report.certificateIssuer, providerType: report.providerType,
          level: report.level, timestampAt: report.timestampAt ? new Date(report.timestampAt) : null,
          revocationCheckedAt: new Date(report.revocationCheckedAt), validatedAt: new Date(report.validatedAt) },
        { id, validation: report })
        return publicResult(signature)
      } catch (error) {
        // A concurrent identical callback or an uncertain commit can be reconciled
        // only through the original successful lease and exact server-computed hash.
        const reconciled = await access(token, raw, checksum)
        if (reconciled.prior) return publicResult(reconciled.prior)
        throw error
      }
    },
    async cleanup(officeId: number) {
      const rows = await transaction(officeId, async (tx, now) => {
        const candidates = await tx.signingArtifact.findMany({ where: { officeId,
          OR: [{ state: 'PENDING', expiresAt: { lt: now } }, { state: 'CLEANING' }] }, take: 20, orderBy: { createdAt: 'asc' } })
        const safe = []
        for (const row of candidates) {
          if (await tx.documentoVersion.count({ where: { storageBucket: row.storageBucket, storageKey: row.storageKey } })) continue
          if (row.state === 'PENDING') await tx.signingArtifact.update({ where: { id: row.id }, data: { state: 'CLEANING' } })
          safe.push(row)
        }
        return safe
      })
      for (const row of rows) {
        await store.remove(row.storageBucket, row.storageKey)
        // Idempotent removal; another cleanup worker may have finished first.
        await transaction(officeId, async tx => {
          await tx.signingArtifact.updateMany({ where: { id: row.id, state: 'CLEANING' }, data: { state: 'DELETED' } })
        })
      }
      return rows.length
    },
  }
}
