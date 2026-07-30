import { NextRequest, NextResponse } from 'next/server'

import { handleApiError, withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiUser(req, 'role.timeline', async context => {
   try {
    const rol = await prisma.rolCausa.findFirst({
      where: { id: params.id, officeId: context.officeId },
      select: { id: true },
    })
    if (!rol) {
      return NextResponse.json({ ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' }, { status: 404 })
    }
    const events = await prisma.activityEvent.findMany({
      where: { officeId: context.officeId, rolId: rol.id },
      include: { user: { select: { email: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    })
    return NextResponse.json({
      ok: true,
      data: events.map(event => ({
        id: event.id,
        userEmail: event.user?.email || 'Sistema',
        accion: event.description,
        eventType: event.eventType,
        createdAt: event.occurredAt.toISOString(),
        requestId: event.requestId,
      })),
    })
  } catch (error) {
    return handleApiError(error, { operation: 'role.timeline', request: req })
  }
  })
}
