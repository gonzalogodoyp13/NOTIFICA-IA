// API route: /api/roles
// GET: List all Demandas for the logged-in user's officeId
// Returns: tribunal.nombre, abogado.nombre, createdAt
// Sorted by createdAt DESC
// Structure ready for future filters via query params (e.g. ?abogadoId=1)
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

    // Get query params for future filters
    const { searchParams } = new URL(req.url)
    const abogadoId = searchParams.get('abogadoId')
    const tribunalId = searchParams.get('tribunalId')

    // Build where clause
    const where: any = {
      officeId: user.officeId,
    }

    // Future filter support
    if (abogadoId) {
      where.abogadoId = parseInt(abogadoId)
    }
    if (tribunalId) {
      where.tribunalId = parseInt(tribunalId)
    }

    const demandas = await prisma.demanda.findMany({
      where,
      include: {
        tribunal: {
          select: {
            id: true,
            nombre: true,
          },
        },
        abogado: {
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

