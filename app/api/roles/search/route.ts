// API route: /api/roles/search
// GET: Search for RolCausa by exact ROL match, scoped by officeId
// Returns: { ok: true, data: { id } } if found
//          { ok: false, error: "NOT_FOUND", message: "..." } if not found
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    console.log('[GET /api/roles/search] Request received')
    
    const user = await getCurrentUserWithOffice()

    if (!user) {
      console.log('[GET /api/roles/search] Unauthorized - no user')
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Get ROL from query params
    const { searchParams } = new URL(req.url)
    const rol = searchParams.get('rol')

    if (!rol) {
      console.log('[GET /api/roles/search] Missing rol parameter')
      return NextResponse.json(
        { ok: false, error: 'Parámetro rol requerido' },
        { status: 400 }
      )
    }

    console.log(`[GET /api/roles/search] Searching for rol: ${rol}, officeId: ${user.officeId}`)

    // Search RolCausa (not Demanda) with exact match, scoped by officeId
    const rolCausa = await prisma.rolCausa.findFirst({
      where: {
        rol: {
          equals: rol.trim(),
          mode: "insensitive",
        },
        officeId: user.officeId, // Scoped by user's office
      },
      select: {
        id: true, // Return only the Prisma ID
      },
    })

    if (!rolCausa) {
      console.log(`[GET /api/roles/search] Rol not found: ${rol}`)
      return NextResponse.json({
        ok: false,
        error: 'NOT_FOUND',
        message: `Sin Resultados. No se registran causas con el rol ${rol}. Crear causa con ROL ${rol}.`,
      })
    }

    console.log(`[GET /api/roles/search] Rol found: ${rolCausa.id}`)
    return NextResponse.json({
      ok: true,
      data: {
        id: rolCausa.id,
      },
    })
  } catch (error) {
    console.error('[GET /api/roles/search] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al buscar el rol' },
      { status: 500 }
    )
  }
}

