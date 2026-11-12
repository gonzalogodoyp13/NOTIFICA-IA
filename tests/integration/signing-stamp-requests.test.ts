import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, fingerprint } from './signing-support'
vi.mock('server-only', () => ({}))
import { enqueueRequestedStamps, notificationSigningStates, replaceNotificationStamp, rememberStampSigningWait } from '../../lib/signing/stampRequests'
import { workflowTransaction } from '../../lib/signing/transaction'
import { createSigningService } from '../../lib/signing/service'

describe.skipIf(process.env.SIGNING_DATABASE_TESTS !== '1')('estampo signing requests', () => {
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>
  beforeAll(async () => { sandbox = await createSigningTestDatabase(); vi.stubEnv('SIGNING_AUTO_ENQUEUE_ENABLED', 'false') }, 120000)
  afterAll(async () => { vi.unstubAllEnvs(); if (sandbox) await sandbox.dispose() }, 60000)

  it('retains offline intent, queues once when a signer returns, and clears the warning after signing', async () => {
    const f = await signingFixture(sandbox.db), d = await f.document()
    await sandbox.db.documento.update({ where: { id: d.doc.id }, data: { sourceTemplate: { signDigitally: true }, generatedByUserId: f.user.id } })
    await sandbox.db.signingDevice.update({ where: { id: f.device.id }, data: { certificateThumbprint: null, health: 'AGENT_ONLINE_TOKEN_MISSING' } })
    const enqueue = () => workflowTransaction(sandbox.db, f.context, tx => enqueueRequestedStamps(tx, f.office.id))
    await workflowTransaction(sandbox.db, f.context, tx => rememberStampSigningWait(tx, f.office.id, { id: d.doc.id, sourceTemplate: { signDigitally: true } }))
    await enqueue()
    expect(await sandbox.db.signingItem.count({ where: { documentoId: d.doc.id } })).toBe(0)
    expect((await notificationSigningStates(sandbox.db, f.office.id, [d.doc.id])).get(d.doc.id)).toMatchObject({ pending: true, tokenMissing: true })
    await sandbox.db.signingDevice.update({ where: { id: f.device.id }, data: { certificateThumbprint: fingerprint, health: 'TOKEN_READY', lastHeartbeatAt: new Date() } })
    await Promise.all([enqueue(), enqueue()])
    expect((await notificationSigningStates(sandbox.db, f.office.id, [d.doc.id])).get(d.doc.id)?.tokenMissing).toBe(true)
    expect(await sandbox.db.signingItem.count({ where: { documentoId: d.doc.id } })).toBe(1)
    const queue = createSigningService(sandbox.db), item = (await queue.claim(f.office.id, f.device.id))!
    const lease = { officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! }
    await queue.start(lease)
    await queue.complete(lease, { signedVersionId: d.output.id, signedChecksum: d.output.checksumSha256, signerFingerprint: fingerprint,
      level: 'PADES_LT', certificateIssuer: 'Test', providerType: 'TEST', timestampAt: new Date(), revocationCheckedAt: new Date(), validatedAt: new Date() })
    expect((await notificationSigningStates(sandbox.db, f.office.id, [d.doc.id])).get(d.doc.id)).toMatchObject({ pending: false, tokenMissing: false })
    expect((await notificationSigningStates(sandbox.db, f.office.id + 1, [d.doc.id])).size).toBe(0)
  }, 60000)

  it('keeps token failures retryable beyond the attempt budget with distinct attempt history', async () => {
    const f = await signingFixture(sandbox.db), d = await f.document(), queue = createSigningService(sandbox.db)
    const job = await queue.createJob(f.context, { idempotencyKey: randomUUID(), signerFingerprint: fingerprint, sourceVersionIds: [d.source.id], maxAttempts: 1 })
    for (let n = 0; n < 3; n++) {
      const item = (await queue.claim(f.office.id, f.device.id))!
      expect(item).not.toBeNull()
      await queue.fail({ officeId: f.office.id, deviceId: f.device.id, itemId: item.id, leaseToken: item.leaseToken! }, 'TOKEN_MISSING')
      await sandbox.db.signingItem.update({ where: { id: item.id }, data: { availableAt: new Date(0) } })
    }
    const result = await queue.getJob(f.context, job.id)
    expect(result.items[0].status).toBe('RETRY_PENDING')
    expect(result.items[0].attemptCount).toBe(0)
    expect(result.items[0].attempts.map(a => a.attemptNumber).sort()).toEqual([1, 2, 3])
  }, 60000)

  it('retires only the same notification and rejects signing a replaced PDF', async () => {
    const f = await signingFixture(sandbox.db), old = await f.document(), replacement = await f.document(), other = await f.document()
    const type = await sandbox.db.diligenciaTipo.create({ data: { nombre: randomUUID(), officeId: f.office.id } })
    const diligence = await sandbox.db.diligencia.create({ data: { rolId: f.rol.id, tipoId: type.id, fecha: new Date() } })
    const notification = await sandbox.db.notificacion.create({ data: { id: randomUUID(), diligenciaId: diligence.id } })
    await sandbox.db.documento.updateMany({ where: { id: { in: [old.doc.id, replacement.doc.id] } }, data: { notificacionId: notification.id, diligenciaId: diligence.id } })
    await workflowTransaction(sandbox.db, f.context, tx => replaceNotificationStamp(tx, f.context, { id: replacement.doc.id, notificacionId: notification.id, diligenciaId: diligence.id }))
    expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: old.doc.id } })).voidedAt).not.toBeNull()
    expect((await sandbox.db.documento.findUniqueOrThrow({ where: { id: other.doc.id } })).voidedAt).toBeNull()
    await expect(createSigningService(sandbox.db).createJob(f.context, { idempotencyKey: randomUUID(), signerFingerprint: fingerprint, sourceVersionIds: [old.source.id] })).rejects.toThrow('INELIGIBLE_SOURCE')
  }, 60000)
})
