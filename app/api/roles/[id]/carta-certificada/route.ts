import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { uploadPdfToDocumentStorage } from '@/lib/documents/storage'
import { prisma } from '@/lib/prisma'
import { loadOfficePdfConfig } from '@/lib/pdf/officeConfig'
import { buildCartaCertificadaPdf } from '@/lib/pdf/carta-certificada'
import { CartaCertificadaSchema } from '@/lib/validations/carta-certificada'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  return withApiUser(req, 'post.roles.id.carta-certificada', async user => {
    const data = parseApiInput(CartaCertificadaSchema, await req.json().catch(() => ({})))
    const rol = await prisma.rolCausa.findFirst({
      where: { id, officeId: user.officeId },
      include: { tribunal: true, demanda: { include: { ejecutados: { include: { comunas: true } } } } },
    })
    if (!rol?.demanda) throw new ApiError('NOT_FOUND', 'Rol no encontrado o sin demanda asociada.', 404)
    const ejecutado = rol.demanda.ejecutados.find(item => item.id === data.ejecutadoId)
    const address = rol.demanda.ejecutados.find(item => item.id === data.direccionEjecutadoId)
    if (!ejecutado || !address) throw new ApiError('VALIDATION_ERROR', 'El demandado y la dirección deben pertenecer a este rol.', 400)
    if (!address.direccion?.trim() || !address.comunas?.nombre) {
      throw new ApiError('VALIDATION_ERROR', 'Complete la dirección y comuna del ejecutado antes de generar la carta.', 400)
    }
    const config = await loadOfficePdfConfig({ officeId: user.officeId, officeCacheRevision: user.officeCacheRevision, fallbackReceptorNombre: user.officeName })
    if (!config.receptorDireccionLinea) throw new ApiError('VALIDATION_ERROR', 'Configure la dirección del receptor en los ajustes PDF de la oficina.', 400)
    const pdfBase64 = await buildCartaCertificadaPdf({
      ...data, receptorNombre: config.receptorNombre, receptorDireccion: config.receptorDireccionLinea,
      nombre: ejecutado.nombre, direccion: address.direccion, comuna: address.comunas.nombre,
      rol: rol.rol, caratula: rol.demanda.caratula, tribunal: rol.tribunal.nombre,
    })
    const documentoId = randomUUID()
    const nombre = `Carta certificada ${ejecutado.nombre}`
    const createdAt = new Date()
    // Upload first: a failed upload must not leave a visible document without a PDF.
    const storedPdf = await uploadPdfToDocumentStorage({ pdfBase64, officeId: user.officeId, rolId: rol.id, documentoId, versionNumber: 1, fileName: nombre, createdAt })
    const document = await prisma.$transaction(async tx => {
      await tx.documento.create({ data: { id: documentoId, rolId: rol.id, nombre, tipo: 'Carta Certificada', version: 1, createdAt } })
      const version = await tx.documentoVersion.create({ data: { documentoId, versionNumber: 1, ...storedPdf, createdByUserId: user.id } })
      const updated = await tx.documento.update({ where: { id: documentoId }, data: { currentVersionId: version.id } })
      await enqueueExternalEvent(tx, user, {
        eventType: 'document.certified_letter_generated', module: 'documents', result: 'success',
        recordType: 'Documento', recordId: documentoId, rolId: rol.id, rol: rol.rol,
        description: 'Carta certificada generada.', deduplicationKey: `certified-letter:${version.id}:generated`,
        metadata: { documentId: documentoId, documentVersionId: version.id, formato: data.formato, version: 1 },
      })
      return updated
    })
    await processActivityOutbox(50).catch(() => undefined)
    return apiSuccess({ id: document.id, nombre: document.nombre, hasPdf: true })
  })
}
