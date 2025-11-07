// API route: /api/demandas/check-rol
// GET: Check if a ROL is unique
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const rol = searchParams.get('rol')

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'ROL es requerido' },
        { status: 400 }
      )
    }

    const existingDemanda = await prisma.demanda.findUnique({
      where: { rol },
      select: {
        id: true,
        rol: true,
        officeId: true,
      },
    })

    if (existingDemanda) {
      // Check if it belongs to the user's office
      if (existingDemanda.officeId === user.officeId) {
        return NextResponse.json({
          ok: true,
          available: false,
          message: 'El ROL ya existe en tu oficina',
        })
      } else {
        return NextResponse.json({
          ok: true,
          available: false,
          message: 'El ROL ya existe en otra oficina',
        })
      }
    }

    return NextResponse.json({
      ok: true,
      available: true,
      message: 'ROL disponible',
    })
  } catch (error) {
    console.error('Error checking ROL:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al verificar el ROL' },
      { status: 500 }
    )
  }
}

