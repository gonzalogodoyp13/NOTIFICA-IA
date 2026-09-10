import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'

export const hashA = 'a'.repeat(64)
export const hashB = 'b'.repeat(64)
export const fingerprint = 'c'.repeat(64)
export async function signingFixture(tx: Prisma.TransactionClient) {
  const suffix = randomUUID()
  const office = await tx.office.create({ data: { nombre: `Signing verification ${suffix}` } })
  const user = await tx.user.create({ data: { officeId: office.id, officeName: office.nombre,
    authUserId: randomUUID(), email: `${suffix}@example.invalid`, isOfficeAdmin: true } })
  const tribunal = await tx.tribunal.create({ data: { officeId: office.id, nombre: 'Test court' } })
  const rol = await tx.rolCausa.create({ data: { id: randomUUID(), officeId: office.id, rol: suffix, tribunalId: tribunal.id } })
  const device = await tx.signingDevice.create({ data: { officeId: office.id, name: 'Fake signer', role: 'SIGNER',
    certificateThumbprint: fingerprint, health: 'TOKEN_READY' } })
  const receiver = await tx.signingDevice.create({ data: { officeId: office.id, name: 'Fake receiver', role: 'RECEIVER' } })
  async function document() {
    const doc = await tx.documento.create({ data: { rolId: rol.id, nombre: 'Synthetic estampo', tipo: 'Estampo' } })
    const source = await tx.documentoVersion.create({ data: { documentoId: doc.id, versionNumber: 1,
      storageBucket: 'test-no-objects', storageKey: randomUUID(), fileName: 'synthetic.pdf', sizeBytes: 100,
      checksumSha256: hashA, mimeType: 'application/pdf' } })
    const output = await tx.documentoVersion.create({ data: { documentoId: doc.id, versionNumber: 2,
      storageBucket: 'test-no-objects', storageKey: randomUUID(), fileName: 'synthetic-signed.pdf', sizeBytes: 200,
      checksumSha256: hashB, mimeType: 'application/pdf' } })
    await tx.documento.update({ where: { id: doc.id }, data: { currentVersionId: source.id } })
    return { doc, source, output }
  }
  return { office, user, rol, device, receiver, document, context: { officeId: office.id, userId: user.id } }
}
