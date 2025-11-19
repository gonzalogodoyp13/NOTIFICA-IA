// API route: /api/roles/[id]
// GET: Returns full details of one Demanda
// Includes: abogado, tribunal, ejecutados (with comuna)
// Filtered by user.officeId
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`[GET /api/roles/${params.id}] Request received`)
    
    const user = await getCurrentUserWithOffice()

    if (!user) {
      console.log(`[GET /api/roles/${params.id}] Unauthorized - no user`)
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    console.log(`[GET /api/roles/${params.id}] User authenticated:`, { id: user.id, email: user.email, officeId: user.officeId })

    const demanda = await prisma.demanda.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId, // Int officeId
      },
      include: {
        tribunales: {
          select: {
            id: true,
            nombre: true,
            direccion: true,
            comuna: true,
          },
        },
        abogados: {
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
        ejecutados: {
          include: {
            comunas: {
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
      console.log(`[GET /api/roles/${params.id}] Demanda not found or doesn't belong to user's office`)
      return NextResponse.json(
        { ok: false, error: 'Demanda no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    console.log(`[GET /api/roles/${params.id}] Success - Demanda found:`, { id: demanda.id, rol: demanda.rol })

    return NextResponse.json({ ok: true, data: demanda })
  } catch (error: any) {
    console.error(`[GET /api/roles/${params.id}] Error:`, error)
    console.error(`[GET /api/roles/${params.id}] Error details:`, {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
    })
    return NextResponse.json(
      { ok: false, error: `Error al obtener la demanda: ${error?.message || 'Error desconocido'}` },
      { status: 500 }
    )
  }
}

