import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { signingFixture, hashA, hashB, fingerprint } from './signing-support'

const enabled = process.env.SIGNING_DATABASE_TESTS === '1'
const tables = ['signing_devices', 'device_enrollments', 'signing_jobs', 'signing_items', 'signing_attempts', 'document_signatures', 'document_deliveries']

describe.skipIf(!enabled)('signing Phase 1: live PostgreSQL migration and authorization', () => {
  it('enforces all tenant FKs, unique identities, immutable sources, RLS and grants; rolls back all fixtures', async () => {
    loadEnvConfig(process.cwd())
    const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL })
    const rollback = new Error('ROLLBACK_SIGNING_FIXTURES')
    let checks = 0
    try {
      await expect(db.$transaction(async tx => {
        const a = await signingFixture(tx)
        const b = await signingFixture(tx)
        const av = await a.document()
        const bv = await b.document()
        expect(av.doc.officeId).toBe(a.office.id)
        expect(av.source.officeId).toBe(a.office.id)
        async function rejected(run: () => Promise<unknown>, expected?: RegExp) {
          await tx.$executeRawUnsafe('SAVEPOINT signing_reject')
          let failed = false
          let message = ''
          try { await run() } catch (error) { failed = true; message = String(error) }
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT signing_reject')
          expect(failed).toBe(true)
          if (expected) expect(message).toMatch(expected)
          checks++
        }
        const jobData = { officeId: a.office.id, requestedByUserId: a.user.id, idempotencyKey: randomUUID(), requestHash: hashA, signerFingerprint: fingerprint }
        const job = await tx.signingJob.create({ data: jobData })
        await rejected(() => tx.signingJob.create({ data: { ...jobData } }))
        await rejected(() => tx.signingJob.create({ data: { ...jobData, idempotencyKey: randomUUID(), requestedByUserId: b.user.id } }))
        const itemData = { officeId: a.office.id, jobId: job.id, documentoId: av.doc.id, sourceVersionId: av.source.id, sourceChecksum: hashA, signerFingerprint: fingerprint }
        const item = await tx.signingItem.create({ data: itemData })
        await rejected(() => tx.signingItem.create({ data: { ...itemData, sourceVersionId: bv.source.id, documentoId: bv.doc.id } }))
        await rejected(() => tx.signingItem.update({ where: { id: item.id }, data: { officeId: b.office.id } }))
        await rejected(() => tx.signingItem.update({ where: { id: item.id }, data: { status: 'CLAIMED', leaseOwner: b.device.id, leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60_000) } }))
        await rejected(() => tx.signingItem.update({ where: { id: item.id }, data: { sourceChecksum: hashB } }))
        await rejected(() => tx.documentoVersion.update({ where: { id: av.source.id }, data: { checksumSha256: hashB } }))
        await rejected(() => tx.documento.update({ where: { id: av.doc.id }, data: { rolId: b.rol.id } }))
        await rejected(() => tx.rolCausa.update({ where: { id: a.rol.id }, data: { officeId: b.office.id } }))
        const otherJob = await tx.signingJob.create({ data: { ...jobData, idempotencyKey: randomUUID() } })
        await rejected(() => tx.signingItem.create({ data: { ...itemData, jobId: otherJob.id } }))
        const enrollment = { officeId: a.office.id, role: 'SIGNER' as const, secretHash: hashA, expiresAt: new Date(Date.now() + 60_000), createdByUserId: a.user.id }
        await tx.deviceEnrollment.create({ data: enrollment })
        await rejected(() => tx.deviceEnrollment.create({ data: { ...enrollment, secretHash: hashB, createdByUserId: b.user.id } }))
        await rejected(() => tx.deviceEnrollment.create({ data: { ...enrollment, secretHash: hashB, deviceId: b.device.id, consumedAt: new Date() } }))
        const attemptData = { officeId: a.office.id, itemId: item.id, deviceId: a.device.id, attemptNumber: 1, leaseToken: randomUUID() }
        await tx.signingAttempt.create({ data: attemptData })
        await rejected(() => tx.signingAttempt.create({ data: { ...attemptData, attemptNumber: 2, leaseToken: randomUUID(), deviceId: b.device.id } }))
        await rejected(() => tx.signingAttempt.create({ data: { ...attemptData, attemptNumber: 2, leaseToken: randomUUID(), officeId: b.office.id, deviceId: b.device.id } }))
        const signatureData = { officeId: a.office.id, itemId: item.id, deviceId: a.device.id, documentoId: av.doc.id,
          sourceVersionId: av.source.id, signedVersionId: av.output.id, signerFingerprint: fingerprint,
          certificateIssuer: 'TEST', providerType: 'TEST', level: 'PADES_LT' as const, sourceChecksum: hashA,
          signedChecksum: hashB, timestampAt: new Date(), revocationCheckedAt: new Date(), validatedAt: new Date() }
        await rejected(() => tx.documentSignature.create({ data: { ...signatureData, deviceId: b.device.id } }))
        await rejected(() => tx.documentSignature.create({ data: { ...signatureData, signedVersionId: bv.output.id } }))
        await rejected(() => tx.documentSignature.create({ data: { ...signatureData, sourceVersionId: bv.source.id } }))
        const signature = await tx.documentSignature.create({ data: signatureData })
        // Distinct item and output isolate source/signer uniqueness from item/output uniqueness.
        await tx.signingItem.update({ where: { id: item.id }, data: { status: 'FAILED' } })
        const retryItem = await tx.signingItem.create({ data: { ...itemData, jobId: otherJob.id } })
        const extraOutput = await tx.documentoVersion.create({ data: { documentoId: av.doc.id, versionNumber: 3, storageBucket: 'test-no-objects', storageKey: randomUUID(), fileName: 'test.pdf', sizeBytes: 201, checksumSha256: hashB, mimeType: 'application/pdf' } })
        await rejected(() => tx.documentSignature.create({ data: { ...signatureData, itemId: retryItem.id, signedVersionId: extraOutput.id } }))
        const delivery = { officeId: a.office.id, signatureId: signature.id, deviceId: a.receiver.id }
        await tx.documentDelivery.create({ data: delivery })
        await rejected(() => tx.documentDelivery.create({ data: { ...delivery, deviceId: b.receiver.id } }))
        await rejected(() => tx.documentDelivery.create({ data: { ...delivery, officeId: b.office.id, deviceId: b.receiver.id } }))
        await rejected(() => tx.signingDevice.update({ where: { id: a.device.id }, data: { officeId: b.office.id } }))
        await rejected(() => tx.documentSignature.update({ where: { id: signature.id }, data: { providerType: 'changed' } }))
        const rls = await tx.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
          SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY(${tables}::text[])`
        expect(rls).toHaveLength(7)
        expect(rls.every(r => r.relrowsecurity)).toBe(true)
        const grants = await tx.$queryRaw<unknown[]>`SELECT * FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND table_name = ANY(${tables}::text[]) AND grantee IN ('anon','authenticated','service_role','PUBLIC')`
        expect(grants).toHaveLength(0)
        for (const role of ['anon', 'authenticated']) {
          for (const table of tables) {
            // Each role is tested with office A's identity against office B.
            await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: a.user.authUserId, role })}, true)`
            for (const operation of ['SELECT * FROM', 'DELETE FROM']) {
              await rejected(async () => {
                await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`)
                return tx.$queryRawUnsafe(`${operation} public.${table} WHERE "officeId" = ${b.office.id}`)
              }, /permission denied/)
            }
            await rejected(async () => {
              await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`)
              return tx.$executeRawUnsafe(`UPDATE public.${table} SET "officeId" = ${a.office.id} WHERE "officeId" = ${b.office.id}`)
            }, /permission denied/)
            await rejected(async () => {
              await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`)
              return tx.$executeRawUnsafe(`INSERT INTO public.${table} (id, "officeId") VALUES ('forged', ${b.office.id})`)
            }, /permission denied/)
          }
        }
        // Defense in depth: prove default-deny RLS independently of revoked grants.
        // This GRANT is transaction-local and rolled back with all fixtures.
        for (const table of tables) {
          await tx.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO authenticated`)
          await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated')
          expect(await tx.$queryRawUnsafe(`SELECT id FROM public.${table}`)).toEqual([])
          expect(await tx.$executeRawUnsafe(`UPDATE public.${table} SET "officeId" = ${b.office.id}`)).toBe(0)
          await tx.$executeRawUnsafe('RESET ROLE')
        }
        throw rollback
      }, { timeout: 180_000, maxWait: 20_000 })).rejects.toBe(rollback)
      expect(checks).toBeGreaterThan(75)
    } finally { await db.$disconnect() }
  }, 200_000)
})
