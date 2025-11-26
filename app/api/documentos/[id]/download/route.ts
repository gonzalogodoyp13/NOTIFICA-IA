import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    // Buscar el documento con su rol para validar ownership
    const documento = await prisma.documento.findFirst({
      where: {
        id: params.id,
      },
      include: {
        rol: {
          select: {
            officeId: true,
          },
        },
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
      return NextResponse.json(
        { ok: false, error: 'No tienes permiso para acceder a este documento' },
        { status: 403 }
      )
    }

    // Validar que el documento tiene PDF
    if (!documento.pdfId) {
      return NextResponse.json(
        { ok: false, error: 'Este documento no tiene PDF asociado' },
        { status: 400 }
      )
    }

    // Decodificar Base64 a Buffer
    const pdfBuffer = Buffer.from(documento.pdfId, 'base64')

    // Sanitizar nombre de archivo para evitar problemas
    const fileName = documento.nombre.replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf'

    // Retornar PDF como binary response
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
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

