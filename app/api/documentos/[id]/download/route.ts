import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { recordActivityEvent } from '@/lib/audit/activityEvent'
import { downloadPdfFromDocumentStorage, hasStoredPdf, pdfBase64ToBuffer } from '@/lib/documents/storage'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    // Extract mode query parameter for inline viewing
    const searchParams = req.nextUrl.searchParams
    const mode = searchParams.get('mode') // 'inline' or null

    // Buscar el documento con su rol para validar ownership
    const documento = await prisma.documento.findFirst({
      where: {
        id: params.id,
      },
      include: {
        rol: {
          select: {
            officeId: true,
            id: true,
            rol: true,
          },
        },
        currentVersion: true,
      },
    })

    if (!documento) {
      return NextResponse.json(
        { ok: false, error: 'Documento no encontrado' },
        { status: 404 }
      )
    }

    // Validar que el documento pertenece a la oficina del usuario
    if (documento.rol.officeId !== user.officeId) {
      await recordActivityEvent({
        userId: user.id,
        officeId: user.officeId,
        eventType: 'document.access_denied',
        module: 'security',
        result: 'denied',
        recordType: 'Documento',
        recordId: params.id,
        description: 'Acceso denegado a documento de otra oficina.',
        metadata: {
          requestedDocumentId: params.id,
          reason: 'cross_office',
        },
      })
      return NextResponse.json(
        { ok: false, error: 'No tienes permiso para acceder a este documento' },
        { status: 403 }
      )
    }

    // Validar que el documento tiene PDF almacenado o PDF legacy en base64
    if (!hasStoredPdf(documento)) {
      return NextResponse.json(
        { ok: false, error: 'Este documento no tiene PDF asociado' },
        { status: 400 }
      )
    }

    const pdfBuffer = documento.currentVersion && !documento.currentVersion.deletedAt
      ? await downloadPdfFromDocumentStorage(
          documento.currentVersion.storageBucket,
          documento.currentVersion.storageKey
        )
      : pdfBase64ToBuffer(documento.pdfId ?? '')

    // Sanitizar nombre de archivo para evitar problemas
    const fileName = documento.currentVersion?.fileName ??
      documento.nombre.replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf'

    // Determine Content-Disposition based on mode parameter
    const disposition = mode === 'inline' || mode === 'view'
      ? `inline; filename="${fileName}"`
      : `attachment; filename="${fileName}"`
    const isInline = mode === 'inline' || mode === 'view'

    await recordActivityEvent({
      userId: user.id,
      officeId: user.officeId,
      eventType: isInline ? 'document.view' : 'document.download',
      module: 'documents',
      result: 'success',
      recordType: 'Documento',
      recordId: documento.id,
      rolId: documento.rol.id,
      rol: documento.rol.rol,
      shortName: documento.nombre,
      description: isInline ? 'Documento visualizado.' : 'Documento descargado.',
      metadata: {
        documentType: documento.tipo,
        mode: isInline ? 'view' : 'download',
        fileName,
        byteSize: pdfBuffer.length,
      },
    })

    // Retornar PDF como binary response
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error descargando documento:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al descargar el documento' },
      { status: 500 }
    )
  }
}

