// API route: /api/logs/recent
// GET endpoint to retrieve the last 10 audit log entries
// Requires authentication via requireSession
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Require authentication and get user email
    const session = await requireSession()

    // Get last 10 audit logs for the current user in descending order (most recent first)
    const logs = await prisma.auditLog.findMany({
      where: {
        userEmail: session.email,
      },
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        userEmail: true,
        action: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: logs,
      count: logs.length,
    })
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    // If requireSession throws, it redirects, but handle other errors
    return NextResponse.json(
      { success: false, error: 'Error al obtener los logs de auditoría' },
      { status: 500 }
    )
  }
}

