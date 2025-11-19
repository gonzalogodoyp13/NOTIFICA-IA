// API route: /api/logs/summary
// GET endpoint to retrieve analytics summary of audit logs
// Requires authentication and scopes to user's office
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Calculate date range (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    // Get total count
    const total = await prisma.auditLog.count({
      where: { officeId: user.officeId },
    })

    // Get count per action type
    const actionCounts = await prisma.auditLog.groupBy({
      by: ['accion'],
      where: { officeId: user.officeId },
      _count: {
        accion: true,
      },
    })

    // Get top 3 users by log count
    const topUsers = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: { officeId: user.officeId },
      _count: {
        userId: true,
      },
      orderBy: {
        _count: {
          userId: 'desc',
        },
      },
      take: 3,
    })

    // Get user emails for top users
    const userIds = topUsers.map((u) => u.userId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    })

    const topUsersWithEmail = topUsers.map((tu) => {
      const user = users.find((u) => u.id === tu.userId)
      return {
        userId: tu.userId,
        email: user?.email || tu.userId,
        count: tu._count.userId,
      }
    })

    // Get logs per day (last 7 days)
    const logsByDay = await prisma.auditLog.findMany({
      where: {
        officeId: user.officeId,
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
      select: {
        createdAt: true,
      },
    })

    // Group by day
    const dayCounts: Record<string, number> = {}
    logsByDay.forEach((log) => {
      const date = new Date(log.createdAt)
      const dayKey = date.toISOString().split('T')[0] // YYYY-MM-DD
      dayCounts[dayKey] = (dayCounts[dayKey] || 0) + 1
    })

    // Generate array for last 7 days
    const last7Days = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)
      const dayKey = date.toISOString().split('T')[0]
      const dayName = date.toLocaleDateString('es-CL', { weekday: 'short' })
      last7Days.push({
        date: dayKey,
        dayName,
        count: dayCounts[dayKey] || 0,
      })
    }

    // Format action counts
    const actionBreakdown = {
      CREATE: 0,
      UPDATE: 0,
      DELETE: 0,
    }

    actionCounts.forEach((ac) => {
      const action = ac.accion.toUpperCase()
      if (action in actionBreakdown) {
        actionBreakdown[action as keyof typeof actionBreakdown] = ac._count.accion
      }
    })

    return NextResponse.json({
      ok: true,
      data: {
        total,
        actionBreakdown,
        topUsers: topUsersWithEmail,
        activityByDay: last7Days,
      },
    })
  } catch (error) {
    console.error('Error fetching logs summary:', error)

    // Handle Prisma connection errors (P1001 - DB unreachable)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P1001'
    ) {
      const errorMessage = 'No se pudieron obtener los datos. Intente nuevamente.'
      return NextResponse.json(
        {
          ok: false,
          message: errorMessage,
          error: errorMessage,
        },
        { status: 503 }
      )
    }

    // Handle other Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const errorMessage = 'Error al procesar la solicitud.'
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 500 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Error al obtener el resumen de actividad.'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

