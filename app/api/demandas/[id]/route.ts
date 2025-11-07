// API route: /api/demandas/[id]
// GET: Fetch a demanda by id
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const demanda = await prisma.demanda.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
      include: {
        tribunal: {
          select: {
            id: true,
            nombre: true,
            direccion: true,
            comuna: true,
          },
        },
        abogado: {
          select: {
            id: true,
            nombre: true,
            rut: true,
            direccion: true,
            comuna: true,
            telefono: true,
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            officeName: true,
          },
        },
        office: {
          select: {
            id: true,
            nombre: true,
          },
        },
        ejecutados: {
          include: {
            comuna: {
              select: {
                id: true,
                nombre: true,
                region: true,
              },
            },
          },
        },
      },
    })

    if (!demanda) {
      return NextResponse.json(
        { ok: false, error: 'Demanda no encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: demanda })
  } catch (error) {
    console.error('Error fetching demanda:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener la demanda' },
      { status: 500 }
    )
  }
}

