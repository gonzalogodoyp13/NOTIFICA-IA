import { NextRequest, NextResponse } from 'next/server'

import { withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'audit.summary', async context => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const [total, actionCounts, topUsers, eventsByDay] = await Promise.all([
      prisma.activityEvent.count({ where: { officeId: context.officeId } }),
      prisma.activityEvent.groupBy({
        by: ['eventType'],
        where: { officeId: context.officeId },
        _count: { eventType: true },
      }),
      prisma.activityEvent.groupBy({
        by: ['userId'],
        where: { officeId: context.officeId, userId: { not: null } },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 3,
      }),
      prisma.activityEvent.findMany({
        where: { officeId: context.officeId, occurredAt: { gte: sevenDaysAgo } },
        select: { occurredAt: true },
      }),
    ])

    const userIds = topUsers.flatMap(item => item.userId ? [item.userId] : [])
    const users = await prisma.user.findMany({
      where: { officeId: context.officeId, id: { in: userIds } },
      select: { id: true, email: true },
    })
    const userEmails = new Map(users.map(user => [user.id, user.email]))
    const dayCounts: Record<string, number> = {}
    for (const event of eventsByDay) {
      const key = event.occurredAt.toISOString().slice(0, 10)
      dayCounts[key] = (dayCounts[key] || 0) + 1
    }
    const activityByDay = Array.from({ length: 7 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - index))
      date.setHours(0, 0, 0, 0)
      const key = date.toISOString().slice(0, 10)
      return {
        date: key,
        dayName: date.toLocaleDateString('es-CL', { weekday: 'short' }),
        count: dayCounts[key] || 0,
      }
    })

    const actionBreakdown = { CREATE: 0, UPDATE: 0, DELETE: 0 }
    for (const item of actionCounts) {
      const suffix = item.eventType.split('.').at(-1)?.toUpperCase()
      if (suffix && suffix in actionBreakdown) {
        actionBreakdown[suffix as keyof typeof actionBreakdown] += item._count.eventType
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        total,
        actionBreakdown,
        topUsers: topUsers.map(item => ({
          userId: item.userId,
          email: item.userId ? userEmails.get(item.userId) || item.userId : 'Sistema',
          count: item._count.userId,
        })),
        activityByDay,
      },
    })
  })
}
