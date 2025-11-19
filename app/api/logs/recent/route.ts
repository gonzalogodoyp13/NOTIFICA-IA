// API route: /api/logs/recent
// GET endpoint to retrieve the last 10 audit log entries
// Requires authentication and scopes to user's office
import { NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Get last 10 audit logs for the current office in descending order (most recent first)
    const logs = await prisma.auditLog.findMany({
      where: {
        officeId: user.officeId,
      },
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({
      ok: true,
      data: logs.map(log => ({
        id: log.id,
        userId: log.userId,
        userEmail: log.user.email,
        tabla: log.tabla,
        accion: log.accion,
        createdAt: log.createdAt,
      })),
      count: logs.length,
    })
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los logs de auditoría'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}
