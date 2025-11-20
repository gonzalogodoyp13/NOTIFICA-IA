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

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
      select: { id: true },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const documentos = await prisma.documento.findMany({
      where: {
        rolId: rol.id,
      },
      include: {
        diligencia: {
          select: {
            id: true,
            tipo: {
              select: {
                nombre: true,
              },
            },
          },
        },
        estampo: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const data = documentos.map(doc => ({
      id: doc.id,
      nombre: doc.nombre,
      tipo: doc.tipo,
      version: doc.version,
      pdfId: doc.pdfId,
      createdAt: doc.createdAt.toISOString(),
      diligencia: doc.diligencia
        ? {
            id: doc.diligencia.id,
            tipo: doc.diligencia.tipo?.nombre,
          }
        : null,
      estampo: doc.estampo
        ? {
            id: doc.estampo.id,
            nombre: doc.estampo.nombre,
            tipo: doc.estampo.tipo,
          }
        : null,
    }))

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Error obteniendo documentos del rol:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener los documentos del rol' },
      { status: 500 }
    )
  }
}

