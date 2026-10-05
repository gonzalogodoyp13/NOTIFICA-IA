import 'server-only'
import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../prisma'
import { assertEligibleVersion, SigningError, type SigningContext } from './core'
import { createSigningJobInTransaction, createSigningService } from './service'
import { lockSigningOffice } from './transaction'
import { signingAlerts } from './monitoring'
import { folderCutoff } from './officeFolder'
import { CenterAction, CenterFilter, signingBusinessDate, signingMessages, type CenterData, type CenterRow } from './centerContracts'

const documentSelect = {
  id: true, officeId: true, nombre: true, tipo: true, rolId: true, currentVersionId: true, voidedAt: true, diligenciaId: true,
  rol: { select: { rol: true, officeId: true } },
  diligencia: { select: { id: true, rolId: true, meta: true, fecha: true } },
  notificacion: { select: { voidedAt: true, meta: true, diligenciaId: true,
    diligencia: { select: { id: true, rolId: true, meta: true, fecha: true } } } },
  currentVersion: { select: { id: true, officeId: true, documentoId: true, checksumSha256: true, mimeType: true,
    storageBucket: true, storageKey: true, sizeBytes: true, deletedAt: true,
    signedSignatures: { select: { id: true } }, sourceSignatures: { select: { id: true } } } },
} satisfies Prisma.DocumentoSelect
type Document = Prisma.DocumentoGetPayload<{ select: typeof documentSelect }>
function exclusion(doc: Document, officeId: number): string | null {
  const diligence = doc.notificacion?.diligencia ?? doc.diligencia
  if (doc.rol.officeId !== officeId || (diligence && diligence.rolId !== doc.rolId) ||
    (doc.diligenciaId && doc.notificacion && doc.diligenciaId !== doc.notificacion.diligenciaId)) return 'Vínculo de diligencia inválido'
  if (doc.voidedAt || doc.notificacion?.voidedAt) return 'Estampo anulado'
  const v = doc.currentVersion
  if (!v || v.deletedAt) return 'Sin PDF vigente'
  if (v.officeId !== officeId || v.documentoId !== doc.id) return 'Versión inválida'
  try { assertEligibleVersion({ ...v, documento: doc }, officeId) } catch { return 'PDF no disponible para firma' }
  if (v.signedSignatures.length || v.sourceSignatures.length) return 'Ya firmado'
  if (v.sizeBytes > 4 * 1024 * 1024) return 'El PDF supera el límite de 4 MiB'
  return null
}
export function manualSigningKey(officeId: number, input: { sources: Array<{ versionId: string; checksum: string }>; signerFingerprint: string; requestedLevel: string }) {
  return 'manual_' + createHash('sha256').update(JSON.stringify({ officeId, signer: input.signerFingerprint,
    level: input.requestedLevel, sources: [...input.sources].sort((a, b) => a.versionId.localeCompare(b.versionId)) })).digest('hex')
}
export function createSigningCenter(db: PrismaClient = prisma) {
  async function actor(tx: Prisma.TransactionClient, context: SigningContext, manage = false) {
    const user = await tx.user.findFirst({ where: { id: context.userId, officeId: context.officeId, isActive: true }, select: { isOfficeAdmin: true } })
    if (!user || (manage && !user.isOfficeAdmin)) throw new SigningError('FORBIDDEN')
    return user
  }
  return {
    async list(context: SigningContext, raw: unknown): Promise<CenterData> {
      const filter = CenterFilter.parse(raw)
      return db.$transaction(async tx => {
        const user = await actor(tx, context), now = new Date()
        // Select metadata only: legacy base64 PDFs and storage bytes never enter this view.
        // Dates live in legacy JSON as well as relational fields, so normalize before
        // filtering/pagination rather than filtering by document creation timestamps.
        const docs = await tx.documento.findMany({ where: { officeId: context.officeId, tipo: 'Estampo', rol: { officeId: context.officeId } }, select: documentSelect })
        const items = await tx.signingItem.findMany({ where: { officeId: context.officeId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: { id: true, documentoId: true, sourceVersionId: true, sourceChecksum: true, status: true, errorCode: true,
            attemptCount: true, maxAttempts: true, leaseExpiresAt: true, jobId: true, availableAt: true,
            job: { select: { idempotencyKey: true, requestedLevel: true, requestedBy: { select: { email: true } } } },
            signature: { select: { id: true, signedVersionId: true, signedChecksum: true, signerFingerprint: true, validatedAt: true, deviceId: true,
              createdAt: true } } } })
        const starts = await tx.activityEvent.findMany({ where: { officeId: context.officeId, eventType: 'signing.started', recordType: 'SigningItem' }, select: { recordId: true } })
        const started = new Set(starts.map(s => s.recordId))
        const devices = await tx.signingDevice.findMany({ where: { officeId: context.officeId }, orderBy: { name: 'asc' },
          select: { id: true, name: true, role: true, health: true, certificateSubject: true, certificateThumbprint: true,
            certificateExpiresAt: true, lastHeartbeatAt: true, revokedAt: true } })
        const rows: CenterRow[] = []
        const itemsByDocument = new Map<string, typeof items>()
        for (const item of items) {
          const group = itemsByDocument.get(item.documentoId) ?? []
          group.push(item); itemsByDocument.set(item.documentoId, group)
        }
        for (const doc of docs) {
          const diligence = doc.notificacion?.diligencia ?? doc.diligencia
          const validLink = (!diligence || diligence.rolId === doc.rolId) && (!doc.diligenciaId || !doc.notificacion || doc.diligenciaId === doc.notificacion.diligenciaId)
          const businessDate = validLink ? signingBusinessDate(doc.notificacion?.meta, diligence?.meta, diligence?.fecha ?? null) : null
          const reason = exclusion(doc, context.officeId), version = doc.currentVersion
          const safeVersion = version?.officeId === context.officeId && version.documentoId === doc.id ? version : null
          const related = itemsByDocument.get(doc.id) ?? []
          const common = { documentId: doc.id, name: doc.nombre, rolId: doc.rolId, rol: doc.rol.rol, businessDate }
          if (!related.some(i => i.sourceVersionId === safeVersion?.id) && !safeVersion?.signedSignatures.length) {
            rows.push({ ...common, id: doc.id, versionId: safeVersion?.id ?? null, checksum: safeVersion?.checksumSha256 ?? null,
              status: reason ? 'EXCLUDED' : 'ELIGIBLE', exclusion: reason, itemId: null, jobId: null, origin: null,
              profile: null, requestedBy: null, attemptCount: 0, maxAttempts: 0, canRetry: false, canCancel: false,
              errorMessage: null, delivery: 'Sin firma validada', signedAt: null, started: false })
          }
          for (const item of related) {
            const expired = ['CLAIMED', 'SIGNING'].includes(item.status) && !!item.leaseExpiresAt && item.leaseExpiresAt <= now
            const hasStarted = started.has(item.id)
            const status = expired ? 'EXPIRED' : item.status
            const superseded = item.sourceVersionId !== safeVersion?.id
            const activeOther = related.some(i => i.id !== item.id && i.sourceVersionId === item.sourceVersionId && !['FAILED', 'CANCELLED'].includes(i.status))
            const canRetry = user.isOfficeAdmin && !reason && !superseded && !activeOther && !item.signature && item.attemptCount < item.maxAttempts &&
              (['FAILED', 'WAITING_FOR_OPERATOR'].includes(item.status) || (expired && item.status === 'SIGNING'))
            const canCancel = user.isOfficeAdmin && !hasStarted && ['QUEUED', 'CLAIMED', 'RETRY_PENDING', 'WAITING_FOR_OPERATOR'].includes(item.status)
            rows.push({ ...common, id: item.id, versionId: item.sourceVersionId, checksum: item.sourceChecksum, status,
              exclusion: item.signature ? null : superseded ? 'Existe una versión más reciente' : reason,
              itemId: item.id, jobId: item.jobId, origin: item.job.idempotencyKey.startsWith('manual_') ? 'MANUAL' : 'AUTOMATIC',
              profile: item.job.requestedLevel, requestedBy: item.job.requestedBy.email, attemptCount: item.attemptCount,
              maxAttempts: item.maxAttempts, canRetry, canCancel, started: hasStarted,
              nextRetryAt: item.status === 'RETRY_PENDING' ? item.availableAt.toISOString() : null,
              evidence: item.signature ? { signatureId: item.signature.id, signedVersionId: item.signature.signedVersionId,
                signedChecksum: item.signature.signedChecksum, signerFingerprint: item.signature.signerFingerprint,
                validatedAt: item.signature.validatedAt.toISOString(), deviceId: item.signature.deviceId } : null,
              deliveries: [], // Legacy delivery history is retained, but no longer drives this view.
              errorMessage: item.errorCode ? signingMessages[item.errorCode] ?? signingMessages.UNKNOWN : expired ? signingMessages.LEASE_EXPIRED : null,
              ...(user.isOfficeAdmin && item.errorCode ? { diagnosticCode: Object.hasOwn(signingMessages, item.errorCode) ? item.errorCode : 'UNKNOWN' } : {}),
              delivery: !item.signature ? 'Sin firma validada' : item.signature.createdAt >= folderCutoff(now)
                ? 'Disponible en la carpeta de la oficina' : 'Disponible en el archivo de la aplicación',
              signedAt: item.signature?.createdAt.toISOString() ?? null })
          }
        }
        const active = (r: CenterRow) => ['QUEUED', 'CLAIMED', 'SIGNING', 'RETRY_PENDING'].includes(r.status)
        const attention = (r: CenterRow) => ['FAILED', 'WAITING_FOR_OPERATOR', 'EXPIRED'].includes(r.status)
        const counts = { eligible: rows.filter(r => r.status === 'ELIGIBLE').length, active: rows.filter(active).length,
          attention: rows.filter(attention).length, completed: rows.filter(r => r.status === 'COMPLETED').length,
          deliveryPending: 0 }
        const filtered = rows.filter(r => (!filter.from || !!r.businessDate && r.businessDate >= filter.from) && (!filter.to || !!r.businessDate && r.businessDate <= filter.to) &&
          (filter.status === 'ALL' || filter.status === 'ACTIVE' && active(r) || filter.status === 'ATTENTION' && attention(r) || r.status === filter.status))
          .sort((a, b) => (b.businessDate ?? '').localeCompare(a.businessDate ?? '') || a.id.localeCompare(b.id))
        return { canManage: user.isOfficeAdmin, canRequest: true, rows: filtered.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize),
          total: filtered.length, page: filter.page, pageSize: filter.pageSize, counts, updatedAt: now.toISOString(),
          alerts: await signingAlerts(tx, context.officeId, now, user.isOfficeAdmin),
          validatorConfigured: Boolean(process.env.SIGNING_VALIDATOR_CONFIG || process.env.SIGNING_VALIDATOR_URL && process.env.SIGNING_VALIDATOR_TOKEN),
          devices: devices.map(d => ({ id: d.id, name: d.name, role: d.role, certificateSubject: d.certificateSubject,
            fingerprint: d.certificateThumbprint, expiresAt: d.certificateExpiresAt?.toISOString() ?? null,
            lastHeartbeatAt: d.lastHeartbeatAt?.toISOString() ?? null, revoked: !!d.revokedAt,
            health: d.revokedAt || !d.lastHeartbeatAt || now.getTime() - d.lastHeartbeatAt.getTime() > 90000 ? 'OFFLINE' :
              d.certificateExpiresAt && d.certificateExpiresAt <= now ? 'CERT_EXPIRED' : d.health })) }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000, maxWait: 15_000 })
    },
    async mutate(context: SigningContext, raw: unknown) {
      const input = CenterAction.parse(raw)
      if (input.action === 'retry-delivery') {
        throw new SigningError('DELIVERY_RETIRED')
      }
      if (input.action !== 'queue') {
        // Queue methods check the administrator and safety guard under their own office lock.
        const queue = createSigningService(db)
        if (input.action === 'retry') {
          await queue.recoverExpired(context)
          await queue.retry(context, input.itemId, { attemptCount: input.attemptCount, reviewed: input.reviewed })
        } else await queue.cancel(context, input.itemId, { attemptCount: input.attemptCount, beforeSigningOnly: true })
        return { accepted: true }
      }
      if (new Set(input.sources.map(s => s.versionId)).size !== input.sources.length) throw new SigningError('DUPLICATE_SOURCE')
      return db.$transaction(async tx => {
        const now = await lockSigningOffice(tx, context.officeId)
        // Every active account member may authorize new signatures for its own office.
        // Recovery, cancellation, device administration and diagnostics remain administrative.
        await actor(tx, context)
        const key = manualSigningKey(context.officeId, input)
        const prior = await tx.signingJob.findUnique({ where: { officeId_idempotencyKey: { officeId: context.officeId, idempotencyKey: key } } })
        if (prior) return { accepted: true, jobId: prior.id, replay: true }
        const signer = await tx.signingDevice.findFirst({ where: { officeId: context.officeId, revokedAt: null,
          role: { in: ['SIGNER', 'SIGNER_RECEIVER'] }, certificateThumbprint: input.signerFingerprint, certificateExpiresAt: { gt: now } } })
        if (!signer) throw new SigningError('SIGNER_UNAVAILABLE')
        const ids = input.sources.map(s => s.versionId)
        const docs = await tx.documento.findMany({ where: { officeId: context.officeId, currentVersionId: { in: ids } }, select: documentSelect })
        if (docs.length !== ids.length) throw new SigningError('SOURCE_CHANGED')
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Documento" WHERE "officeId" = ${context.officeId} AND id IN (${Prisma.join(docs.map(d => d.id))}) ORDER BY id FOR UPDATE`)
        const locked = await tx.documento.findMany({ where: { officeId: context.officeId, currentVersionId: { in: ids } }, select: documentSelect })
        if (locked.length !== ids.length) throw new SigningError('SOURCE_CHANGED')
        for (const doc of locked) {
          if (exclusion(doc, context.officeId) || doc.currentVersion?.checksumSha256 !== input.sources.find(s => s.versionId === doc.currentVersionId)?.checksum)
            throw new SigningError('SOURCE_CHANGED')
        }
        if (await tx.signingItem.count({ where: { officeId: context.officeId, sourceVersionId: { in: ids } } })) throw new SigningError('USE_EXISTING_JOB')
        const job = await createSigningJobInTransaction(tx, context, { idempotencyKey: key, sourceVersionIds: ids,
          signerFingerprint: input.signerFingerprint, requestedLevel: input.requestedLevel })
        return { accepted: true, jobId: job.id, replay: false }
      }, { timeout: 30_000, maxWait: 15_000 })
    },
  }
}
