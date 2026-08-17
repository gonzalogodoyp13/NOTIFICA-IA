import { withApiUser } from '@/lib/api/server'
// API route: /api/roles/search
// GET: Search for RolCausa by exact ROL match, scoped by officeId
// Returns: { ok: true, data: { id } } if found
//          { ok: false, error: "NOT_FOUND", message: "..." } if not found
import { NextRequest, NextResponse } from 'next/server'
import { recordActivityEvent } from '@/lib/audit/activityEvent'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.roles.search', async user => {
  try {

    // Get ROL from query params
    const { searchParams } = new URL(req.url)
    const rol = searchParams.get('rol')

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Parámetro rol requerido' },
        { status: 400 }
      )
    }

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
      await recordActivityEvent({
        userId: user.id,
        officeId: user.officeId,
        eventType: 'search.roles',
        module: 'search',
        result: 'success',
        recordType: 'RolCausa',
        description: 'Busqueda exacta de ROL realizada.',
        metadata: {
          resultCount: 0,
          page: 1,
          pageSize: 1,
          hasResults: false,
          searchMode: 'exact',
        },
      })
      return NextResponse.json({
        ok: false,
        error: 'NOT_FOUND',
        data: { rol: rol.trim() },
        message: `No se registran causas con el rol ${rol.trim()}.`,
      })
    }

    await recordActivityEvent({
      userId: user.id,
      officeId: user.officeId,
      eventType: 'search.roles',
      module: 'search',
      result: 'success',
      recordType: 'RolCausa',
      recordId: rolCausa.id,
      description: 'Busqueda exacta de ROL realizada.',
      metadata: {
        resultCount: 1,
        page: 1,
        pageSize: 1,
        hasResults: true,
        searchMode: 'exact',
      },
    })
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

  })
}

