import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'

import { recordActivityEvent } from '@/lib/audit/activityEvent'
import { downloadPdfFromDocumentStorage, hasStoredPdf, pdfBase64ToBuffer } from '@/lib/documents/storage'
import { buildPdfDownloadFileName, contentDispositionForPdf } from '@/lib/documents/downloadFileName'
import { prisma } from '@/lib/prisma'
import { asJsonObject, getString } from '@/lib/utils/json'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'get.documentos.id.download', async user => {
  try {

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
        estampo: { select: { nombre: true } },
        estampoBase: { select: { nombreVisible: true } },
        notificacion: { select: { meta: true } },
        diligencia: { select: { meta: true } },
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

    const fallbackFileName = documento.currentVersion?.fileName ??
      documento.nombre.replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf'
    const notificationMeta = asJsonObject(documento.notificacion?.meta)
    const diligenceMeta = asJsonObject(documento.diligencia?.meta)
    const execution = asJsonObject(notificationMeta?.ejecucion) ?? asJsonObject(diligenceMeta?.ejecucion)
    const executionDateText =
      getString(execution?.fecha) ??
      getString(notificationMeta?.fechaEjecucion) ??
      getString(diligenceMeta?.fechaEjecucion)
    const receipt = documento.tipo.toLowerCase() === 'recibo'
      ? await prisma.recibo.findFirst({
          where: { documentoId: documento.id },
          orderBy: { createdAt: 'desc' },
          select: { fechaEjecucion: true },
        })
      : null
    const generationVariables = asJsonObject(documento.generationVariables)
    const sourceTemplate = asJsonObject(documento.sourceTemplate)
    const estampoName =
      documento.estampo?.nombre ??
      documento.estampoBase?.nombreVisible ??
      getString(generationVariables?.resultado) ??
      getString(sourceTemplate?.name)
    const executionDate = receipt?.fechaEjecucion ??
      (executionDateText ? new Date(`${executionDateText.slice(0, 10)}T12:00:00`) : null)
    const fileName = buildPdfDownloadFileName({
      documentType: documento.tipo,
      rol: documento.rol.rol,
      estampoName,
      executionDate,
      fallbackFileName,
    })

    // Determine Content-Disposition based on mode parameter
    const disposition = contentDispositionForPdf(mode, fileName)
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

  })
}

