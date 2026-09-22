import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, fingerprint, hashB } from './signing-support'

const boundary = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient, user: { id: '', officeId: 0 } }))
const deleteStoredPdf = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('server-only', () => ({}))
vi.mock('../../lib/documents/storage', () => ({ deletePdfFromDocumentStorage: deleteStoredPdf }))
vi.mock('../../lib/prisma', () => ({ prisma: new Proxy({}, { get: (_, key) => {
  const value = boundary.db[key as keyof PrismaClient]
  return typeof value === 'function' ? value.bind(boundary.db) : value
} }) }))
// Simulate an authenticated application user at the existing auth boundary;
// execute the real route, workflow, queue and audit against real PostgreSQL.
vi.mock('../../lib/api/server', () => ({
  withApiUser: (_req: unknown, _operation: string, callback: (user: typeof boundary.user) => unknown) => callback(boundary.user),
  ApiError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message) } },
  apiFailure: (error: { message: string; status: number }) => Response.json({ ok: false, error: error.message }, { status: error.status }),
}))
import { PUT } from '../../app/api/diligencias/[id]/complete/route'
import { PUT as legacyUpdate } from '../../app/api/diligencias/route'
import { DELETE as deleteDocument } from '../../app/api/documentos/route'
import { syncDiligenceWorkflowState } from '../../lib/roles/workflowState'
import { workflowTransaction } from '../../lib/signing/transaction'
import { createSigningService } from '../../lib/signing/service'
import { completionMetadataForUpdate } from '../../lib/signing/completionMetadata'

describe.skipIf(process.env.SIGNING_DATABASE_TESTS !== '1')('Phase 3 completion: real route and transaction', () => {
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>
  beforeAll(async () => { sandbox = await createSigningTestDatabase(); boundary.db = sandbox.db }, 120_000)
  afterAll(async () => { if (sandbox) await sandbox.dispose() }, 60_000)
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  async function fixture() {
    const f = await signingFixture(sandbox.db)
    const tipo = await sandbox.db.diligenciaTipo.create({ data: { officeId: f.office.id, nombre: 'Synthetic diligence' } })
    const diligence = await sandbox.db.diligencia.create({ data: { rolId: f.rol.id, tipoId: tipo.id, fecha: new Date('2026-09-10T12:00:00Z') } })
    const notification = await sandbox.db.notificacion.create({ data: { id: randomUUID(), diligenciaId: diligence.id } })
    await sandbox.db.documento.create({ data: { rolId: f.rol.id, diligenciaId: diligence.id,
      notificacionId: notification.id, nombre: 'Receipt', tipo: 'Recibo', pdfId: 'synthetic-legacy-receipt' } })
    async function stamp(notificationOnly = false) {
      const v = await f.document()
      await sandbox.db.documento.update({ where: { id: v.doc.id }, data: {
        diligenciaId: notificationOnly ? null : diligence.id, notificacionId: notification.id,
      } })
      return v
    }
    boundary.user = { id: f.user.id, officeId: f.office.id }
    vi.stubEnv('SIGNING_AUTO_ENQUEUE_ENABLED', 'true')
    vi.stubEnv('SIGNING_AUTO_ENQUEUE_OFFICES', JSON.stringify({ [f.office.id]: { signerFingerprint: fingerprint } }))
    const request = (body: unknown = {}) => PUT(new NextRequest('http://localhost/api/diligencias/' + diligence.id + '/complete',
      { method: 'PUT', body: JSON.stringify(body) }), { params: { id: diligence.id } })
    const sync = () => workflowTransaction(sandbox.db, f.context, tx => syncDiligenceWorkflowState(diligence.id, tx, f.context))
    return { ...f, diligence, notification, stamp, request, sync }
  }

  it('completes through the HTTP handler with one exact-source batch; concurrent replays never duplicate', async () => {
    const f = await fixture()
    const a = await f.stamp(), b = await f.stamp(true)
    const responses = await Promise.all([f.request({ observaciones: 'Done' }), f.request({ observaciones: 'Done' })])
    expect(responses.map(r => r.status)).toEqual([200, 200])
    const [first, second] = await Promise.all(responses.map(r => r.json()))
    expect(first.data.estado).toBe('completada')
    expect(first.signing.jobId).toBe(second.signing.jobId)
    expect(first.signing.completionEventId).toBe(second.signing.completionEventId)
    expect(first.data.meta.completadaEn).toBe(second.data.meta.completadaEn)
    const jobs = await sandbox.db.signingJob.findMany({ where: { officeId: f.office.id }, include: { items: true } })
    expect(jobs).toHaveLength(1)
    expect(jobs[0].items.map(i => [i.sourceVersionId, i.sourceChecksum]).sort()).toEqual([
      [a.source.id, a.source.checksumSha256], [b.source.id, b.source.checksumSha256],
    ].sort())
    expect(jobs[0].items.every(i => i.status === 'QUEUED')).toBe(true)
    expect(await sandbox.db.signingAttempt.count({ where: { officeId: f.office.id } })).toBe(0)
    expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(0)
    expect(await sandbox.db.documentDelivery.count({ where: { officeId: f.office.id } })).toBe(0)
    expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'signing.requested' } })).toBe(1)
    const replay = await (await f.request()).json()
    expect(replay.signing.status).toBe('EXISTING_JOB')
    const count = await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'signing.document_excluded' } })
    await f.request()
    expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'signing.document_excluded' } })).toBe(count)
  }, 60_000)

  it('uses the office basic profile through completion, worker evidence and replay without a timestamp', async () => {
    const f = await fixture()
    const stamp = await f.stamp()
    vi.stubEnv('SIGNING_AUTO_ENQUEUE_OFFICES', JSON.stringify({ [f.office.id]: { signerFingerprint: fingerprint, requestedLevel: 'PADES_B' } }))
    const response = await f.request()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.signing.queuedCount).toBe(1)
    const service = createSigningService(sandbox.db)
    expect((await service.getJob(f.context, body.signing.jobId)).requestedLevel).toBe('PADES_B')
    const item = (await service.claim(f.office.id, f.device.id))!
    const lease = { officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! }
    await service.start(lease)
    const signature = await service.complete(lease, { signedVersionId: stamp.output.id, signedChecksum: hashB,
      signerFingerprint: fingerprint, level: 'PADES_B', certificateIssuer: 'Synthetic', providerType: 'FAKE_TEST_WORKER',
      revocationCheckedAt: new Date(), validatedAt: new Date() })
    expect(signature.timestampAt).toBeNull()
    const replay = await (await f.request()).json()
    expect(replay.signing.status).toBe('EXISTING_JOB')
    expect(replay.signing.jobId).toBe(body.signing.jobId)
    expect(replay.signing.jobStatus).toBe('COMPLETED')
    expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(1)
    expect(await sandbox.db.documentSignature.count({ where: { officeId: f.office.id } })).toBe(1)
  }, 60_000)

  it('excludes voided/missing/invalid and foreign documents without exposing foreign IDs', async () => {
    const f = await fixture()
    const good = await f.stamp(), voided = await f.stamp(), invalid = await f.stamp()
    await sandbox.db.documento.update({ where: { id: voided.doc.id }, data: { voidedAt: new Date() } })
    await sandbox.db.documentoVersion.update({ where: { id: invalid.source.id }, data: { checksumSha256: 'invalid' } })
    const missing = await sandbox.db.documento.create({ data: { rolId: f.rol.id, diligenciaId: f.diligence.id, nombre: 'Missing', tipo: 'Estampo', pdfId: 'legacy-without-version' } })
    const voidNotification = await sandbox.db.notificacion.create({ data: { id: randomUUID(), diligenciaId: f.diligence.id, voidedAt: new Date() } })
    const voidChild = await f.stamp()
    await sandbox.db.documento.update({ where: { id: voidChild.doc.id }, data: { notificacionId: voidNotification.id } })
    const other = await signingFixture(sandbox.db), foreign = await other.document()
    await sandbox.db.documento.update({ where: { id: foreign.doc.id }, data: { diligenciaId: f.diligence.id, notificacionId: f.notification.id } })
    const badPointer = await f.stamp()
    await sandbox.db.documento.update({ where: { id: badPointer.doc.id }, data: { currentVersionId: foreign.source.id } })
    const response = await f.request()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.signing.queuedCount).toBe(1)
    expect(body.signing.exclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ documentId: voided.doc.id, reason: 'VOIDED' }),
      expect.objectContaining({ documentId: voidChild.doc.id, reason: 'VOIDED' }),
      expect.objectContaining({ documentId: missing.id, reason: 'MISSING_PDF' }),
      expect.objectContaining({ documentId: invalid.doc.id, reason: 'INVALID_STATE' }),
      expect.objectContaining({ documentId: badPointer.doc.id, sourceVersionId: null, reason: 'INVALID_STATE' }),
    ]))
    expect(JSON.stringify(body.signing)).not.toContain(foreign.doc.id)
    expect(JSON.stringify(body.signing)).not.toContain(foreign.source.id)
    const items = await sandbox.db.signingItem.findMany({ where: { officeId: f.office.id } })
    expect(items.map(i => i.sourceVersionId)).toEqual([good.source.id])
    expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'signing.document_excluded' } })).toBe(5)
  }, 60_000)

  it('records already queued and already signed sources while batching only the remainder', async () => {
    const f = await fixture()
    const signed = await f.stamp(), queued = await f.stamp(), good = await f.stamp()
    const service = createSigningService(sandbox.db)
    await service.createJob(f.context, { idempotencyKey: randomUUID(), sourceVersionIds: [signed.source.id], signerFingerprint: fingerprint })
    const item = (await service.claim(f.office.id, f.device.id))!
    const lease = { officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! }
    await service.start(lease)
    await service.complete(lease, { signedVersionId: signed.output.id, signedChecksum: hashB,
      signerFingerprint: fingerprint, level: 'PADES_LT', certificateIssuer: 'Synthetic', providerType: 'FAKE_TEST_WORKER',
      timestampAt: new Date(), revocationCheckedAt: new Date(), validatedAt: new Date() })
    const previous = await service.createJob(f.context, { idempotencyKey: randomUUID(), sourceVersionIds: [queued.source.id], signerFingerprint: fingerprint })
    // Rotating the configured certificate must not automatically sign the same
    // source again or duplicate a request already owned by another signer.
    vi.stubEnv('SIGNING_AUTO_ENQUEUE_OFFICES', JSON.stringify({ [f.office.id]: { signerFingerprint: 'd'.repeat(64) } }))
    const body = await (await f.request()).json()
    expect(body.signing.queuedCount).toBe(1)
    expect(body.signing.exclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ documentId: signed.doc.id, reason: 'ALREADY_SIGNED' }),
      expect.objectContaining({ documentId: queued.doc.id, reason: 'ALREADY_QUEUED', jobId: previous.id }),
    ]))
    const created = await sandbox.db.signingItem.findMany({ where: { jobId: body.signing.jobId } })
    expect(created.map(i => i.sourceVersionId)).toEqual([good.source.id])
  }, 60_000)

  it('rolls back completion, job, items and audit if the final completion audit fails', async () => {
    const f = await fixture(); await f.stamp()
    // Fault is installed only in the disposable schema; rejects after enqueue.
    await sandbox.db.$executeRawUnsafe(`CREATE FUNCTION "${sandbox.schema}".fail_completion_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" = 'diligence.completed' THEN RAISE EXCEPTION 'synthetic completion failure'; END IF; RETURN NEW; END $$`)
    await sandbox.db.$executeRawUnsafe(`CREATE TRIGGER fail_completion_audit BEFORE INSERT ON "${sandbox.schema}".activity_events FOR EACH ROW EXECUTE FUNCTION "${sandbox.schema}".fail_completion_audit()`)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await f.request({ observaciones: 'Must roll back', fechaRealizacion: '2026-10-01' })).status).toBe(500)
      const after = await sandbox.db.diligencia.findUniqueOrThrow({ where: { id: f.diligence.id } })
      expect(after.estado).toBe('pendiente')
      expect(after.meta).toBeNull()
      expect(after.fecha).toEqual(f.diligence.fecha)
      expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(0)
      expect(await sandbox.db.signingItem.count({ where: { officeId: f.office.id } })).toBe(0)
      expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id } })).toBe(0)
    } finally {
      await sandbox.db.$executeRawUnsafe(`DROP TRIGGER fail_completion_audit ON "${sandbox.schema}".activity_events`)
      await sandbox.db.$executeRawUnsafe(`DROP FUNCTION "${sandbox.schema}".fail_completion_audit()`)
    }
  }, 60_000)

  it('does not complete incomplete/failed workflows, rejects foreign requests, and rolls back metadata', async () => {
    const f = await fixture()
    expect((await f.request({ observaciones: 'No stamp' })).status).toBe(400)
    await f.stamp()
    await sandbox.db.diligencia.update({ where: { id: f.diligence.id }, data: { estado: 'fallida' } })
    expect((await f.request()).status).toBe(400)
    const other = await signingFixture(sandbox.db)
    boundary.user = { id: other.user.id, officeId: other.office.id }
    expect((await f.request()).status).toBe(404)
    expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(0)
    expect((await sandbox.db.diligencia.findUniqueOrThrow({ where: { id: f.diligence.id } })).meta).toBeNull()
  }, 60_000)

  it('keeps disabled offices free of jobs and fails enabled invalid configuration atomically', async () => {
    const f = await fixture(); await f.stamp()
    vi.stubEnv('SIGNING_AUTO_ENQUEUE_ENABLED', 'false')
    const result = await f.sync()
    expect(result.status).toBe('completada')
    expect(result.signing.status).toBe('DISABLED')
    expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(0)
    await sandbox.db.diligencia.update({ where: { id: f.diligence.id }, data: { estado: 'pendiente', meta: { before: true } } })
    vi.stubEnv('SIGNING_AUTO_ENQUEUE_ENABLED', 'true'); vi.stubEnv('SIGNING_AUTO_ENQUEUE_OFFICES', 'invalid')
    await expect(f.sync()).rejects.toThrow('Invalid automatic signing configuration')
    expect((await sandbox.db.diligencia.findUniqueOrThrow({ where: { id: f.diligence.id } })).estado).toBe('pendiente')
  }, 60_000)

  it('the shared document-generation hook enqueues the final stamp in the same transaction', async () => {
    const f = await fixture()
    const v = await f.document()
    await sandbox.db.documento.update({ where: { id: v.doc.id }, data: { currentVersionId: null, diligenciaId: f.diligence.id, notificacionId: f.notification.id } })
    expect((await f.sync()).status).toBe('pendiente')
    await expect(workflowTransaction(sandbox.db, f.context, async tx => {
      await tx.documento.update({ where: { id: v.doc.id }, data: { currentVersionId: v.source.id } })
      await syncDiligenceWorkflowState(f.diligence.id, tx, f.context)
      throw new Error('synthetic document finalization failure')
    })).rejects.toThrow('synthetic document finalization failure')
    expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: v.doc.id } })).currentVersionId).toBeNull()
    expect((await sandbox.db.diligencia.findUniqueOrThrow({ where: { id: f.diligence.id } })).estado).toBe('pendiente')
    expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(0)
    const result = await workflowTransaction(sandbox.db, f.context, async tx => {
      await tx.documento.update({ where: { id: v.doc.id }, data: { currentVersionId: v.source.id } })
      return syncDiligenceWorkflowState(f.diligence.id, tx, f.context)
    })
    expect(result.signing.status).toBe('QUEUED')
    expect(result.signing.queuedCount).toBe(1)
    expect((await f.sync()).signing.jobId).toBe(result.signing.jobId)
    // A later unsigned version has a different source identity and gets an item.
    await sandbox.db.documento.update({ where: { id: v.doc.id }, data: { currentVersionId: v.output.id } })
    expect((await f.sync()).signing.queuedCount).toBe(1)
    expect(await sandbox.db.signingItem.count({ where: { officeId: f.office.id } })).toBe(2)
  }, 60_000)

  it('records an all-excluded completed batch without creating an empty job', async () => {
    const f = await fixture()
    const missing = await sandbox.db.documento.create({ data: { rolId: f.rol.id, diligenciaId: f.diligence.id,
      notificacionId: f.notification.id, nombre: 'Legacy stamp', tipo: 'Estampo', pdfId: 'legacy-without-version' } })
    const response = await f.request()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.estado).toBe('completada')
    expect(body.signing).toMatchObject({ status: 'NO_ELIGIBLE_DOCUMENTS', jobId: null, queuedCount: 0,
      exclusions: [{ documentId: missing.id, sourceVersionId: null, reason: 'MISSING_PDF' }] })
    expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(0)
    expect(await sandbox.db.activityEvent.count({ where: { officeId: f.office.id, eventType: 'signing.document_excluded' } })).toBe(1)
  }, 60_000)

  it('a cancelled job remains cancelled on completion replay', async () => {
    const f = await fixture(); await f.stamp()
    const first = await f.sync()
    const item = await sandbox.db.signingItem.findFirstOrThrow({ where: { jobId: first.signing.jobId! } })
    await createSigningService(sandbox.db).cancel(f.context, item.id)
    const replay = await f.sync()
    expect(replay.signing).toMatchObject({ status: 'EXISTING_JOB', jobStatus: 'CANCELLED', queuedCount: 0, jobId: first.signing.jobId })
    expect(await sandbox.db.signingJob.count({ where: { officeId: f.office.id } })).toBe(1)
  }, 60_000)

  it('preserves completion identity across metadata edits and creates a new event only after reopening', async () => {
    const f = await fixture(); await f.stamp()
    const first = await f.sync()
    await workflowTransaction(sandbox.db, f.context, async tx => {
      await tx.diligencia.update({ where: { id: f.diligence.id }, data: {
        meta: await completionMetadataForUpdate(tx, f.diligence.id, { signingCompletionEventId: 'forged', completadaEn: 'forged', note: 'Edited' }),
      } })
    })
    expect((await f.sync()).signing.completionEventId).toBe(first.signing.completionEventId)
    const notification = await sandbox.db.notificacion.create({ data: { id: randomUUID(), diligenciaId: f.diligence.id } })
    expect((await f.sync()).status).toBe('pendiente')
    const next = await f.document()
    await sandbox.db.documento.update({ where: { id: next.doc.id }, data: { diligenciaId: f.diligence.id, notificacionId: notification.id } })
    // Receipt-last completion uses the same hook as receipt finalization.
    const second = await workflowTransaction(sandbox.db, f.context, async tx => {
      await tx.documento.create({ data: { rolId: f.rol.id, diligenciaId: f.diligence.id, notificacionId: notification.id,
        nombre: 'Receipt last', tipo: 'Recibo', pdfId: 'synthetic-legacy-receipt' } })
      return syncDiligenceWorkflowState(f.diligence.id, tx, f.context)
    })
    expect(second.signing.completionEventId).not.toBe(first.signing.completionEventId)
    expect(second.signing.queuedCount).toBe(1)
    expect(second.signing.exclusions).toEqual([expect.objectContaining({ reason: 'ALREADY_QUEUED', jobId: first.signing.jobId })])
    expect(await sandbox.db.signingItem.count({ where: { officeId: f.office.id } })).toBe(2)
  }, 60_000)

  it('the legacy update endpoint cannot bypass derived completion or forge its signing event', async () => {
    const f = await fixture()
    const update = () => legacyUpdate(new NextRequest('http://localhost/api/diligencias', { method: 'PUT',
      body: JSON.stringify({ id: f.diligence.id, estado: 'completada', meta: { signingCompletionEventId: 'forged' } }) }))
    const incomplete = await (await update()).json()
    expect(incomplete.data.estado).toBe('pendiente')
    await f.stamp()
    const first = await (await update()).json()
    expect(first.data.estado).toBe('completada')
    expect(first.data.signing.status).toBe('QUEUED')
    expect(first.data.signing.completionEventId).not.toBe('forged')
    const repeated = await (await update()).json()
    expect(repeated.data.signing.jobId).toBe(first.data.signing.jobId)
    expect(repeated.data.signing.completionEventId).toBe(first.data.signing.completionEventId)
  }, 60_000)

  it('a rejected deletion of a queued source never removes its stored PDFs', async () => {
    const f = await fixture(); const stamp = await f.stamp(); await f.sync()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    deleteStoredPdf.mockClear()
    const response = await deleteDocument(new NextRequest('http://localhost/api/documentos?id=' + stamp.doc.id, { method: 'DELETE' }))
    expect(response.status).toBe(500)
    expect(deleteStoredPdf).not.toHaveBeenCalled()
    expect(await sandbox.db.documentoVersion.count({ where: { documentoId: stamp.doc.id } })).toBe(2)
    const unqueued = await f.document()
    const deleted = await deleteDocument(new NextRequest('http://localhost/api/documentos?id=' + unqueued.doc.id, { method: 'DELETE' }))
    expect(deleted.status).toBe(200)
    expect(await sandbox.db.documento.count({ where: { id: unqueued.doc.id } })).toBe(0)
    expect(deleteStoredPdf).toHaveBeenCalledTimes(2)
  }, 60_000)
})
