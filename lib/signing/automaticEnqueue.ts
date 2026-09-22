import 'server-only'
import { createHash } from 'node:crypto'
import { Prisma, type SigningJobStatus } from '@prisma/client'
import { activityEventData } from '../audit/activityEvent'
import { assertEligibleVersion, type SigningContext } from './core'
import { automaticSigningConfig } from './automaticConfig'
import { createSigningJobInTransaction } from './service'

export type SigningExclusionReason = 'MISSING_PDF' | 'VOIDED' | 'ALREADY_SIGNED' | 'ALREADY_QUEUED' | 'INVALID_STATE'
export type SigningExclusion = { documentId: string; sourceVersionId: string | null; reason: SigningExclusionReason; jobId?: string }
export type AutomaticSigningResult = {
  status: 'DISABLED' | 'NOT_COMPLETED' | 'QUEUED' | 'EXISTING_JOB' | 'NO_ELIGIBLE_DOCUMENTS'
  completionEventId: string | null
  jobId: string | null
  jobStatus: SigningJobStatus | null
  queuedCount: number
  existingJobIds: string[]
  exclusions: SigningExclusion[]
}
export function emptySigningResult(status: 'DISABLED' | 'NOT_COMPLETED', completionEventId: string | null = null): AutomaticSigningResult {
  return { status, completionEventId, jobId: null, jobStatus: null, queuedCount: 0, existingJobIds: [], exclusions: [] }
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function completionSigningKey(officeId: number, diligenceId: string, completionEventId: string,
  sources: Array<{ id: string; checksumSha256: string }>, signerFingerprint: string, requestedLevel: string) {
  return `completion_${digest({ officeId, diligenceId, completionEventId, signerFingerprint, requestedLevel,
    sources: sources.map(v => ({ id: v.id, checksumSha256: v.checksumSha256 })).sort((a, b) => a.id.localeCompare(b.id)) })}`
}

/** Called only after deriving completion, inside the workflow transaction and
 * office lock. No network, storage, device or cryptographic operation occurs.
 */
export async function enqueueCompletedDiligence(tx: Prisma.TransactionClient, context: SigningContext,
  diligence: { id: string; rolId: string }, completionEventId: string): Promise<AutomaticSigningResult> {
  const config = automaticSigningConfig(context.officeId)
  if (!config) return emptySigningResult('DISABLED', completionEventId)

  const scope: Prisma.DocumentoWhereInput = {
    officeId: context.officeId, rol: { officeId: context.officeId }, tipo: 'Estampo',
    OR: [{ diligenciaId: diligence.id }, { notificacion: { diligenciaId: diligence.id } }],
  }
  // Stabilize currentVersion pointers even against older writers which do not
  // take the signing office lock. The checksum binding trigger protects bytes.
  const ids = await tx.documento.findMany({ where: scope, select: { id: true } })
  if (ids.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "Documento"
    WHERE id IN (${Prisma.join(ids.map(d => d.id))}) ORDER BY id FOR UPDATE`)
  const documents = await tx.documento.findMany({ where: scope, orderBy: { id: 'asc' }, include: {
    notificacion: { select: { diligenciaId: true, voidedAt: true } },
    currentVersion: { include: {
      signedSignatures: { where: { officeId: context.officeId }, select: { id: true } },
      sourceSignatures: { where: { officeId: context.officeId }, select: { id: true } },
      signingItems: { where: { officeId: context.officeId,
        status: { notIn: ['FAILED', 'CANCELLED'] } }, select: { jobId: true } },
    } },
  } })
  const exclusions: SigningExclusion[] = []
  const snapshots: Array<{ id: string; checksumSha256: string }> = []
  const eligibleIds: string[] = []
  for (const doc of documents) {
    const version = doc.currentVersion
    // Do not expose a foreign version ID from a malformed legacy pointer.
    const sourceVersionId = version?.officeId === context.officeId && version.documentoId === doc.id ? version.id : null
    let reason: SigningExclusionReason | undefined
    let jobId: string | undefined
    if (doc.rolId !== diligence.rolId || (doc.diligenciaId && doc.diligenciaId !== diligence.id) ||
      (doc.notificacion && doc.notificacion.diligenciaId !== diligence.id)) reason = 'INVALID_STATE'
    else if (doc.voidedAt || doc.notificacion?.voidedAt) reason = 'VOIDED'
    else if (!version || version.deletedAt || !version.storageBucket || !version.storageKey || version.sizeBytes <= 0) reason = 'MISSING_PDF'
    else {
      try {
        if (!sourceVersionId) throw new Error('Invalid source')
        assertEligibleVersion({ ...version, documento: doc }, context.officeId)
        snapshots.push({ id: version.id, checksumSha256: version.checksumSha256 })
        if (version.signedSignatures.length || version.sourceSignatures.length) reason = 'ALREADY_SIGNED'
        else if (version.signingItems.length) { reason = 'ALREADY_QUEUED'; jobId = version.signingItems[0].jobId }
        else eligibleIds.push(version.id)
      } catch { reason = 'INVALID_STATE' }
    }
    if (reason) exclusions.push({ documentId: doc.id, sourceVersionId, reason, ...(jobId ? { jobId } : {}) })
  }

  // Include all valid snapshots, including those queued by an earlier replay.
  // Filtering queued sources before hashing would change the key on retries.
  const idempotencyKey = completionSigningKey(context.officeId, diligence.id, completionEventId,
    snapshots, config.signerFingerprint, config.requestedLevel)
  let job = await tx.signingJob.findUnique({ where: { officeId_idempotencyKey: { officeId: context.officeId, idempotencyKey } } })
  const replay = !!job
  if (!job && eligibleIds.length) job = await createSigningJobInTransaction(tx, context, {
    idempotencyKey, sourceVersionIds: eligibleIds, ...config,
  })
  const result: AutomaticSigningResult = {
    status: replay ? 'EXISTING_JOB' : job ? 'QUEUED' : 'NO_ELIGIBLE_DOCUMENTS', completionEventId,
    jobId: job?.id ?? null, jobStatus: job?.status ?? null, queuedCount: replay ? 0 : eligibleIds.length,
    existingJobIds: Array.from(new Set(exclusions.flatMap(e => e.jobId ? [e.jobId] : []))).sort(), exclusions,
  }
  // One catalog-validated event per exclusion avoids audit-array truncation.
  // Deduplication keeps repeated completion requests from growing the same log.
  const common = { officeId: context.officeId, userId: context.userId, source: 'INTERNAL' as const,
    module: 'documents' as const, rolId: diligence.rolId, recordType: 'Diligencia', recordId: diligence.id }
  const events = exclusions.map(exclusion => activityEventData({ ...common,
    eventType: 'signing.document_excluded',
    deduplicationKey: `signing-excluded:${digest([context.officeId, completionEventId, config, exclusion])}`,
    metadata: { diligenceId: diligence.id, completionEventId, ...exclusion },
  }))
  events.push(activityEventData({ ...common, eventType: 'signing.completion_evaluated',
    deduplicationKey: `signing-evaluation:${digest([context.officeId, diligence.id, result, idempotencyKey])}`,
    metadata: { diligenceId: diligence.id, completionEventId, jobId: result.jobId, status: result.status,
      queuedCount: result.queuedCount, excludedCount: exclusions.length },
  }))
  await tx.activityEvent.createMany({ data: events, skipDuplicates: true })
  return result
}
