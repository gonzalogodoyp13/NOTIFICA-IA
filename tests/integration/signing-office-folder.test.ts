import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSigningTestDatabase } from './signing-test-database'
import { signingFixture, fingerprint, hashA } from './signing-support'
vi.mock('server-only', () => ({}))
import { createDeviceService } from '../../lib/signing/devices'
import { createOfficeFolderService, folderCutoff } from '../../lib/signing/officeFolder'
import { createDeviceHandler } from '../../lib/signing/deviceHttp'
import { sha256 } from '../../lib/signing/deviceProtocol'
import type { SigningStorage } from '../../lib/signing/artifacts'

it('uses exactly 50 elapsed days, inclusive at the cutoff', () => {
  expect(folderCutoff(new Date('2026-10-01T12:00:00Z')).toISOString()).toBe('2026-08-12T12:00:00.000Z')
})

describe.skipIf(process.env.SIGNING_DATABASE_TESTS !== '1')('shared office folder and permanent signed archive', () => {
  let sandbox: Awaited<ReturnType<typeof createSigningTestDatabase>>
  let f: Awaited<ReturnType<typeof signingFixture>>, foreign: Awaited<ReturnType<typeof signingFixture>>
  const bytes = Buffer.from('%PDF-1.7\nSigned archive fixture\n%%EOF'), checksum = sha256(bytes)
  const storage: SigningStorage = { assertPrivate: vi.fn(async () => {}), download: vi.fn(async () => bytes), upload: vi.fn(), remove: vi.fn() }
  let service: ReturnType<typeof createDeviceService>, archive: ReturnType<typeof createOfficeFolderService>
  let signer: string, receiver: string, combined: string, other: string
  let ids: Array<{ doc: string; source: string; signed: string; item: string; signature: string; date: Date }>
  beforeAll(async () => {
    sandbox = await createSigningTestDatabase(); f = await signingFixture(sandbox.db); foreign = await signingFixture(sandbox.db)
    service = createDeviceService(sandbox.db, { storage }); archive = createOfficeFolderService(sandbox.db, async () => { throw Error('NO_DEVICE') }, storage)
    async function session(deviceId: string, officeId: number) {
      const token = randomBytes(32).toString('base64url')
      await sandbox.db.deviceSession.create({ data: { deviceId, officeId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) } }); return token
    }
    signer = await session(f.device.id, f.office.id); receiver = await session(f.receiver.id, f.office.id); other = await session(foreign.device.id, foreign.office.id)
    const both = await sandbox.db.signingDevice.create({ data: { officeId: f.office.id, role: 'SIGNER_RECEIVER', name: 'Combined' } })
    combined = await session(both.id, f.office.id)
    const job = await sandbox.db.signingJob.create({ data: { officeId: f.office.id, requestedByUserId: f.user.id, idempotencyKey: randomUUID(), requestHash: hashA, signerFingerprint: fingerprint } })
    ids = Array.from({ length: 54 }, (_, n) => ({ doc: randomUUID(), source: randomUUID(), signed: randomUUID(), item: randomUUID(), signature: randomUUID(),
      date: new Date(Date.now() - (n === 52 ? 51 : n === 53 ? 49 : 1) * 86400_000) }))
    await sandbox.db.documento.createMany({ data: ids.map((id, n) => ({ id: id.doc, officeId: f.office.id, rolId: f.rol.id, nombre: `Archive ${n}`, tipo: n === 53 ? 'Other signed document' : 'Estampo' })) })
    await sandbox.db.documentoVersion.createMany({ data: ids.flatMap(id => [
      { id: id.source, documentoId: id.doc, officeId: f.office.id, versionNumber: 1, storageBucket: 'documents', storageKey: `source/${id.source}`, fileName: 'source.pdf', sizeBytes: bytes.length, checksumSha256: hashA, mimeType: 'application/pdf' },
      { id: id.signed, documentoId: id.doc, officeId: f.office.id, versionNumber: 2, storageBucket: 'documents', storageKey: `signed/${id.signed}`, fileName: 'signed.pdf', sizeBytes: bytes.length, checksumSha256: checksum, mimeType: 'application/pdf' },
    ]) })
    await sandbox.db.signingItem.createMany({ data: ids.map(id => ({ id: id.item, officeId: f.office.id, jobId: job.id, documentoId: id.doc, sourceVersionId: id.source, sourceChecksum: hashA, signerFingerprint: fingerprint, status: 'COMPLETED' })) })
    await sandbox.db.signingArtifact.createMany({ data: ids.map(id => ({ id: id.signed, officeId: f.office.id, itemId: id.item, deviceId: f.device.id, leaseToken: randomUUID(), storageBucket: 'documents', storageKey: `signed/${id.signed}`, checksumSha256: checksum, sizeBytes: bytes.length, state: 'COMMITTED', validation: { fixture: true }, expiresAt: new Date(Date.now() + 3600_000) })) })
    await sandbox.db.documentSignature.createMany({ data: ids.map(id => ({ id: id.signature, officeId: f.office.id, itemId: id.item, deviceId: f.device.id, documentoId: id.doc, sourceVersionId: id.source, signedVersionId: id.signed,
      signerFingerprint: fingerprint, certificateIssuer: 'Test', providerType: 'TEST', level: 'PADES_LT', sourceChecksum: hashA, signedChecksum: checksum,
      timestampAt: id.date, revocationCheckedAt: id.date, validatedAt: id.date, createdAt: id.date })) })
  }, 120000)
  afterAll(async () => { if (sandbox) await sandbox.dispose() }, 60000)
  it('gives all device roles the same paginated metadata without PDF downloads, including non-estampos', async () => {
    vi.mocked(storage.download).mockClear()
    const first = await service.officeFolder(signer, {})
    expect(first.documents).toHaveLength(50); expect(first.nextCursor).not.toBeNull()
    const second = await service.officeFolder(signer, { asOf: first.asOf, cursor: first.nextCursor })
    expect(second.documents).toHaveLength(3); expect(second.nextCursor).toBeNull()
    expect(new Set([...first.documents, ...second.documents].map(d => d.signatureId)).size).toBe(53)
    expect(second.documents.some(d => d.signatureId === ids[53].signature)).toBe(true)
    expect((await service.officeFolder(receiver, {})).documents).toEqual(first.documents)
    expect((await service.officeFolder(combined, {})).documents).toEqual(first.documents)
    expect((await service.officeFolder(other, {})).documents).toEqual([])
    expect(storage.download).not.toHaveBeenCalled()
    expect(JSON.stringify(first)).not.toMatch(/storageKey|storageBucket|Bearer|https:/)
    expect(await sandbox.db.documentDelivery.count({ where: { officeId: f.office.id } })).toBe(0)
  }, 60000)
  it('keeps older and superseded signed versions searchable and retrievable only through the application', async () => {
    const id = ids[52], input = { signatureId: id.signature, checksumSha256: checksum }
    await expect(service.officeFolderDownload(signer, input)).rejects.toThrow('NOT_FOUND')
    const result = await archive.archive(f.context, { q: 'Archive 52' })
    expect(result.documents[0].signedVersionId).toBe(id.signed)
    expect((await archive.archiveDownload(f.context, input)).bytes).toEqual(bytes)
    await sandbox.db.documento.update({ where: { id: id.doc }, data: { currentVersionId: id.source } })
    expect((await archive.archiveDownload(f.context, input)).bytes).toEqual(bytes)
    await expect(archive.archiveDownload(foreign.context, input)).rejects.toThrow('NOT_FOUND')
    await sandbox.db.user.update({ where: { id: f.user.id }, data: { isActive: false } })
    await expect(archive.archive(f.context, {})).rejects.toThrow('FORBIDDEN')
    await sandbox.db.user.update({ where: { id: f.user.id }, data: { isActive: true } })
    expect(storage.remove).not.toHaveBeenCalled()
  }, 60000)
  it('enforces office/auth boundaries, byte integrity, revocation during retrieval and private HTTP responses', async () => {
    const input = { signatureId: ids[0].signature, checksumSha256: checksum }
    await expect(service.officeFolderDownload(other, input)).rejects.toThrow('NOT_FOUND')
    await expect(service.officeFolderDownload(signer, { ...input, checksumSha256: hashA })).rejects.toThrow('CHECKSUM_MISMATCH')
    vi.mocked(storage.download).mockResolvedValueOnce(Buffer.from('%PDF-corrupt'))
    await expect(service.officeFolderDownload(signer, input)).rejects.toThrow('CHECKSUM_MISMATCH')
    const response = await createDeviceHandler(service)(new NextRequest('https://localhost/api/signing/device/office-folder-download', {
      method: 'POST', headers: { authorization: `Bearer ${signer}`, 'content-type': 'application/json' }, body: JSON.stringify(input) }), 'office-folder-download')
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
    vi.mocked(storage.download).mockImplementationOnce(async () => { await service.revoke(f.context, f.receiver.id); return bytes })
    await expect(service.officeFolderDownload(receiver, input)).rejects.toThrow('DEVICE_UNAUTHORIZED')
    await expect(service.officeFolder(receiver, {})).rejects.toThrow('DEVICE_UNAUTHORIZED')
    await expect(service.officeFolder(signer, { officeId: foreign.office.id })).rejects.toThrow()
    await expect(service.officeFolder(signer, { asOf: new Date(Date.now() - 3600_000).toISOString() })).rejects.toThrow('FOLDER_SNAPSHOT_EXPIRED')
  }, 60000)
})
