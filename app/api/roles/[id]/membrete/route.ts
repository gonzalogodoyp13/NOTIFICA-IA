import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { recordActivityEvent } from '@/lib/audit/activityEvent'
import { hasStoredPdf, uploadPdfToDocumentStorage } from '@/lib/documents/storage'
import { prisma } from '@/lib/prisma'
import { buildMembretePdf } from '@/lib/pdf/membrete'
import { MembreteGenerateSchema } from '@/lib/validations/rol-workspace'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

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
    const documentVersion = await prisma.documentoVersion.create({
      data: {
        documentoId: documento.id,
        versionNumber: 1,
        ...storedPdf,
        createdByUserId: user.id,
      },
    })
    const documentoWithVersion = await prisma.documento.update({
      where: { id: documento.id },
      data: { currentVersionId: documentVersion.id },
      include: { currentVersion: true },
    })

    await recordActivityEvent({
      userId: user.id,
      officeId: user.officeId,
      eventType: 'document.generate',
      module: 'documents',
      result: 'success',
      recordType: 'Documento',
      recordId: documentoWithVersion.id,
      rolId: rol.id,
      rol: rol.rol,
      shortName: documentoWithVersion.nombre,
      description: 'Membrete generado.',
      metadata: {
        documentType: documentoWithVersion.tipo,
        templateType: 'membrete',
        pageSize: data.pageSize,
        placement: data.placement,
        version: documentoWithVersion.version,
      },
    })

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
}
