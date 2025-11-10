// API route: /api/roles
// GET: List all ROLs for current user's office
// POST: Create new RolCausa from Demanda (optional)
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    console.log('[API /roles] Getting user...')
    const user = await getCurrentUserWithOffice()
    console.log('[API /roles] User result:', user ? { id: user.id, email: user.email, officeId: user.officeId } : 'null')

    if (!user) {
      console.error('[API /roles] No user found - returning 401')
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Convert officeId to string for Phase 4 models
    const officeIdStr = String(user.officeId)

    // Parse query parameters
    const searchParams = req.nextUrl.searchParams
    const q = searchParams.get('q') || undefined
    const estado = searchParams.get('estado') || undefined
    const tribunalId = searchParams.get('tribunalId') || undefined
    const from = searchParams.get('from') || undefined
    const to = searchParams.get('to') || undefined
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    // Build where clause
    const where: any = {
      officeId: officeIdStr,
    }

    if (q) {
      where.OR = [
        { rol: { contains: q, mode: 'insensitive' } },
        { demanda: { caratula: { contains: q, mode: 'insensitive' } } },
      ]
    }

    if (estado) {
      where.estado = estado
    }

    if (tribunalId) {
      where.tribunalId = tribunalId
    }

    if (from || to) {
      where.createdAt = {}
      if (from) {
        where.createdAt.gte = new Date(from)
      }
      if (to) {
        where.createdAt.lte = new Date(to)
      }
    }

    // Get total count for pagination
    const total = await prisma.rolCausa.count({ where })

    // Fetch ROLs with minimal info
    const roles = await prisma.rolCausa.findMany({
      where,
      select: {
        id: true,
        rol: true,
        estado: true,
        createdAt: true,
        tribunal: {
          select: {
            nombre: true,
          },
        },
        demanda: {
          select: {
            caratula: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return NextResponse.json({
      ok: true,
      data: roles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error fetching roles:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener los roles' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { demandaId, rol, tribunalId, estado } = body

    // Validate required fields
    if (!rol || !tribunalId) {
      return NextResponse.json(
        { ok: false, error: 'rol y tribunalId son requeridos' },
        { status: 400 }
      )
    }

    // Convert officeId to string
    const officeIdStr = String(user.officeId)

    // If demandaId provided, verify it belongs to user's office
    if (demandaId) {
      const demanda = await prisma.demanda.findFirst({
        where: {
          id: demandaId,
          officeId: user.officeId, // Demanda uses Int officeId
        },
      })

      if (!demanda) {
        return NextResponse.json(
          { ok: false, error: 'Demanda no encontrada o no pertenece a tu oficina' },
          { status: 404 }
        )
      }
    }

    // Verify tribunal belongs to user's office
    const tribunal = await prisma.tribunal.findFirst({
      where: {
        id: tribunalId,
        officeId: officeIdStr,
      },
    })

    if (!tribunal) {
      return NextResponse.json(
        { ok: false, error: 'Tribunal no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Create RolCausa
    const rolCausa = await prisma.rolCausa.create({
      data: {
        demandaId: demandaId || null,
        officeId: officeIdStr,
        rol,
        tribunalId,
        estado: estado || 'pendiente',
      },
      include: {
        tribunal: {
          select: {
            nombre: true,
          },
        },
        demanda: {
          select: {
            caratula: true,
          },
        },
      },
    })

    await logAudit({
      userEmail: user.email,
      userId: user.id,
      officeId: officeIdStr,
      tabla: 'RolCausa',
      accion: 'Creó nuevo RolCausa',
      diff: { id: rolCausa.id, rol: rolCausa.rol },
    })

    return NextResponse.json({ ok: true, data: rolCausa })
  } catch (error) {
    console.error('Error creating rol:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al crear el rol' },
      { status: 500 }
    )
  }
}

