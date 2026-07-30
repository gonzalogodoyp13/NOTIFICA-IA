import { NextRequest, NextResponse } from 'next/server'

import { withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'audit.recent', async context => {
    const events = await prisma.activityEvent.findMany({
      where: { officeId: context.officeId },
      take: 10,
      orderBy: { occurredAt: 'desc' },
      include: { user: { select: { id: true, email: true } } },
    })
    return NextResponse.json({
      ok: true,
      data: events.map(event => ({
        id: event.id,
        userId: event.userId,
        userEmail: event.user?.email || 'Sistema',
        tabla: event.recordType || event.module,
        accion: event.eventType,
        createdAt: event.occurredAt,
        requestId: event.requestId,
      })),
      count: events.length,
    })
  })
}
