import 'server-only'
import { type Prisma, type PrismaClient, type SigningDevice } from '@prisma/client'
import { z } from 'zod'
import { DeviceError, DeviceId, Hash, Secret, sha256 } from './deviceProtocol'
import { lockSigningOffice } from './transaction'
import { documentStorage, type DocumentObjectStore } from '../documents/objectStore'
import { type SigningContext } from './core'

export const OFFICE_FOLDER_DAYS = 50
// Older validated signatures predate the current 4MiB signing-upload limit.
const MAX_ARCHIVE_PDF = 32 * 1024 * 1024
export const folderCutoff = (now: Date) => new Date(now.getTime() - OFFICE_FOLDER_DAYS * 86400_000)
const cursorSchema = z.object({ at: z.string().datetime(), id: DeviceId }).strict()
const listSchema = z.object({ asOf: z.string().datetime().optional(), cursor: cursorSchema.nullable().optional() }).strict()
const fileSchema = z.object({ signatureId: DeviceId, checksumSha256: Hash }).strict()
export const ArchiveFilter = z.object({ q: z.string().trim().max(120).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).strict()
const include = { signedVersion: { include: { documento: { select: { nombre: true, rol: { select: { rol: true } } } } } },
  item: { select: { artifacts: { where: { state: 'COMMITTED' }, select: { id: true, checksumSha256: true } } } } } satisfies Prisma.DocumentSignatureInclude
type Signed = Prisma.DocumentSignatureGetPayload<{ include: typeof include }>
function eligible(officeId: number): Prisma.DocumentSignatureWhereInput {
  return { officeId, signedVersion: { officeId, deletedAt: null, mimeType: 'application/pdf', sizeBytes: { gte: 8, lte: MAX_ARCHIVE_PDF },
    documento: { officeId, rol: { officeId } } }, item: { artifacts: { some: { officeId, state: 'COMMITTED' } } } }
}
function validated(row: Signed) {
  return row.signedChecksum === row.signedVersion.checksumSha256 && row.item.artifacts.some(a => a.id === row.signedVersionId && a.checksumSha256 === row.signedChecksum)
}
function view(row: Signed) {
  const label = `${row.signedVersion.documento.rol.rol}-${row.signedVersion.documento.nombre}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 65)
  return { signatureId: row.id, documentId: row.documentoId, signedVersionId: row.signedVersionId,
    fileName: `${label}-${row.signedVersionId}.pdf`, name: row.signedVersion.documento.nombre.slice(0, 250),
    rol: row.signedVersion.documento.rol.rol.slice(0, 120), signedAt: row.createdAt.toISOString(),
    checksumSha256: row.signedChecksum, sizeBytes: row.signedVersion.sizeBytes }
}

type Authenticate = (tx: Prisma.TransactionClient, token: string, now: Date) => Promise<SigningDevice>
export function createOfficeFolderService(db: PrismaClient, authenticate: Authenticate, store: DocumentObjectStore = documentStorage) {
  async function device<T>(token: string, run: (tx: Prisma.TransactionClient, d: SigningDevice, now: Date) => Promise<T>) {
    Secret.parse(token)
    const session = await db.deviceSession.findUnique({ where: { tokenHash: sha256(token) }, select: { officeId: true } })
    if (!session) throw new DeviceError('DEVICE_UNAUTHORIZED', 401)
    return db.$transaction(async tx => {
      const now = await lockSigningOffice(tx, session.officeId)
      // All enrolled roles can read their office. Signing privilege is unrelated.
      return run(tx, await authenticate(tx, token, now), now)
    }, { timeout: 30_000, maxWait: 15_000 })
  }
  async function access(tx: Prisma.TransactionClient, officeId: number, input: z.infer<typeof fileSchema>, now?: Date) {
    const row = await tx.documentSignature.findFirst({ where: { ...eligible(officeId), id: input.signatureId,
      ...(now ? { createdAt: { gte: folderCutoff(now), lte: now } } : {}) }, include })
    if (!row || !validated(row)) throw new DeviceError('NOT_FOUND', 404)
    if (row.signedChecksum !== input.checksumSha256) throw new DeviceError('CHECKSUM_MISMATCH', 409)
    return row
  }
  async function read(row: Signed) {
    const v = row.signedVersion
    await store.assertPrivate(v.storageBucket)
    const bytes = await store.download(v.storageBucket, v.storageKey)
    if (bytes.length !== v.sizeBytes || sha256(bytes) !== row.signedChecksum || bytes.subarray(0, 5).toString('ascii') !== '%PDF-')
      throw new DeviceError('CHECKSUM_MISMATCH', 409)
    return bytes
  }
  async function user<T>(context: SigningContext, run: (tx: Prisma.TransactionClient) => Promise<T>) {
    return db.$transaction(async tx => {
      if (!await tx.user.findFirst({ where: { id: context.userId, officeId: context.officeId, isActive: true } })) throw new DeviceError('FORBIDDEN')
      return run(tx)
    }, { isolationLevel: 'RepeatableRead', timeout: 30_000 })
  }
  return {
    async list(token: string, raw: unknown) {
      const input = listSchema.parse(raw)
      return device(token, async (tx, d, now) => {
        const asOf = input.asOf ? new Date(input.asOf) : now
        if (asOf > now || now.getTime() - asOf.getTime() > 30 * 60_000 || input.cursor && !input.asOf) throw new DeviceError('FOLDER_SNAPSHOT_EXPIRED', 409)
        const rows = await tx.documentSignature.findMany({ where: { ...eligible(d.officeId),
          createdAt: { gte: folderCutoff(now), lte: asOf }, ...(input.cursor ? { OR: [
            { createdAt: { lt: new Date(input.cursor.at) } }, { createdAt: new Date(input.cursor.at), id: { gt: input.cursor.id } } ] } : {}) },
          include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 50 })
        const last = rows.at(-1)
        return { officeId: d.officeId, windowDays: OFFICE_FOLDER_DAYS, asOf: asOf.toISOString(), cutoff: folderCutoff(now).toISOString(),
          nextCursor: rows.length === 50 && last ? { at: last.createdAt.toISOString(), id: last.id } : null,
          documents: rows.filter(validated).map(view) }
      })
    },
    async download(token: string, raw: unknown) {
      const input = fileSchema.parse(raw)
      const row = await device(token, (tx, d, now) => access(tx, d.officeId, input, now))
      const bytes = await read(row)
      // Revocation/deletion/expiry while storage was loading must fail closed.
      await device(token, (tx, d, now) => access(tx, d.officeId, input, now))
      return bytes
    },
    async archive(context: SigningContext, raw: unknown) {
      const input = ArchiveFilter.parse(raw)
      return user(context, async tx => {
        const where: Prisma.DocumentSignatureWhereInput = { ...eligible(context.officeId), ...(input.q ? { OR: [
          { documentoId: { contains: input.q, mode: 'insensitive' } }, { signedVersionId: { contains: input.q, mode: 'insensitive' } },
          { signedVersion: { documento: { OR: [{ nombre: { contains: input.q, mode: 'insensitive' } }, { rol: { rol: { contains: input.q, mode: 'insensitive' } } }] } } },
        ] } : {}) }
        const rows = await tx.documentSignature.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (input.page - 1) * input.pageSize, take: input.pageSize })
        return { documents: rows.filter(validated).map(view), total: await tx.documentSignature.count({ where }), page: input.page, pageSize: input.pageSize }
      })
    },
    async archiveDownload(context: SigningContext, raw: unknown) {
      const input = fileSchema.parse(raw)
      const row = await user(context, tx => access(tx, context.officeId, input))
      const bytes = await read(row)
      await user(context, tx => access(tx, context.officeId, input))
      return { bytes, fileName: view(row).fileName }
    },
  }
}
