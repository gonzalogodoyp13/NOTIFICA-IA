// API route: /api/roles/[id]
// GET: Return full detail of one RolCausa
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

    const { id } = params
    const officeIdStr = String(user.officeId)

    // Fetch RolCausa with all relations, filtered by officeId
    const rolCausa = await prisma.rolCausa.findFirst({
      where: {
        id,
        officeId: officeIdStr,
      },
      include: {
        tribunal: true,
        demanda: {
          include: {
            abogados: {
              select: {
                nombre: true,
                rut: true,
              },
            },
          },
        },
        diligencias: {
          include: {
            tipo: {
              select: {
                nombre: true,
                descripcion: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        documentos: {
          include: {
            estampo: true,
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
          },
          orderBy: { createdAt: 'desc' },
        },
        notas: {
          orderBy: { createdAt: 'desc' },
        },
        recibos: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!rolCausa) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: rolCausa })
  } catch (error) {
    console.error('Error fetching rol:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener el rol' },
      { status: 500 }
    )
  }
}

