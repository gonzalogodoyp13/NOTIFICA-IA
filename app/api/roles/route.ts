// API route: /api/roles
// GET: List all Demandas for the logged-in user's officeId (Phase 3)
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    console.log('[GET /api/roles] Request received')
    
    const user = await getCurrentUserWithOffice()

    if (!user) {
      console.log('[GET /api/roles] Unauthorized - no user')
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    console.log('[GET /api/roles] User authenticated:', { id: user.id, email: user.email, officeId: user.officeId })

    // Get query params for future filters (structure ready but not implemented yet)
    const { searchParams } = new URL(req.url)
    const abogadoId = searchParams.get('abogadoId')
    const tribunalId = searchParams.get('tribunalId')

    // Build where clause
    const where: any = {
      officeId: user.officeId, // Int officeId
    }

    // Future filter support (prepared but not active)
    if (abogadoId) {
      where.abogadoId = parseInt(abogadoId)
    }
    if (tribunalId) {
      where.tribunalId = parseInt(tribunalId)
    }

    const demandas = await prisma.demanda.findMany({
      where,
      include: {
        tribunales: {
          select: {
            id: true,
            nombre: true,
          },
        },
        abogados: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    console.log(`[GET /api/roles] Found ${demandas.length} demandas`)

    return NextResponse.json({ ok: true, data: demandas })
  } catch (error) {
    console.error('[GET /api/roles] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener las demandas' },
      { status: 500 }
    )
  }
}


