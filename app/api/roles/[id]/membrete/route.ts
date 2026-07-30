import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'

import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { hasStoredPdf, uploadPdfToDocumentStorage } from '@/lib/documents/storage'
import { prisma } from '@/lib/prisma'
import { buildMembretePdf } from '@/lib/pdf/membrete'
import { MembreteGenerateSchema } from '@/lib/validations/rol-workspace'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'post.roles.id.membrete', async user => {
  try {

    const raw = await req.json().catch(() => ({}))
    const parsed = MembreteGenerateSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const data = parsed.data

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
      include: {
        tribunal: {
          select: {
            nombre: true,
          },
        },
        demanda: {
          include: {
            abogados: {
              select: {
                nombre: true,
              },
            },
            ejecutados: {
              include: {
                comunas: {
                  select: {
                    nombre: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!rol || !rol.demanda) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o sin demanda asociada' },
        { status: 404 }
      )
    }

    const ejecutado = rol.demanda.ejecutados.find(item => item.id === data.ejecutadoId)

    if (!ejecutado) {
      return NextResponse.json(
        { ok: false, error: 'Ejecutado no encontrado para este rol' },
        { status: 404 }
      )
    }

    const direccion = [ejecutado.direccion, ejecutado.comunas?.nombre]
      .filter(Boolean)
      .join(', ')

    const pdfBase64 = await buildMembretePdf(
      {
        nombre: ejecutado.nombre,
        direccion,
        causa: [rol.tribunal?.nombre, rol.rol].filter(Boolean).join(' / '),
        rol: rol.rol,
        caratulado: rol.demanda.caratula,
        abogado: rol.demanda.abogados?.nombre ?? '',
      },
      data.placement,
      data.pageSize
    )

    const documento = await prisma.documento.create({
      data: {
        rolId: rol.id,
        nombre: `Membrete ${ejecutado.nombre}`,
        tipo: 'Membrete',
        pdfId: null,
        version: 1,
      },
    })
    const storedPdf = await uploadPdfToDocumentStorage({
      pdfBase64,
      officeId: user.officeId,
      rolId: rol.id,
      documentoId: documento.id,
      versionNumber: 1,
      fileName: documento.nombre,
      createdAt: documento.createdAt,
    })
    const documentoWithVersion = await prisma.$transaction(async tx => {
      const documentVersion = await tx.documentoVersion.create({
        data: { documentoId: documento.id, versionNumber: 1, ...storedPdf, createdByUserId: user.id },
      })
      const updated = await tx.documento.update({
        where: { id: documento.id }, data: { currentVersionId: documentVersion.id }, include: { currentVersion: true },
      })
      await enqueueExternalEvent(tx, user, {
        eventType: 'document.letterhead_generated', module: 'documents', result: 'success',
        recordType: 'Documento', recordId: updated.id, rolId: rol.id, rol: rol.rol,
        description: 'Membrete generado.',
        deduplicationKey: `letterhead:${documentVersion.id}:generated`,
        metadata: { documentId: updated.id, documentVersionId: documentVersion.id, documentType: updated.tipo, pageSize: data.pageSize, placement: data.placement, version: updated.version },
      })
      return updated
    })
    await processActivityOutbox(50).catch(() => undefined)

    return NextResponse.json({
      ok: true,
      data: {
        id: documentoWithVersion.id,
        nombre: documentoWithVersion.nombre,
        tipo: documentoWithVersion.tipo,
        version: documentoWithVersion.version,
        hasPdf: hasStoredPdf(documentoWithVersion),
        createdAt: documentoWithVersion.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error generando membrete:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al generar el membrete' },
      { status: 500 }
    )
  }

  })
}
