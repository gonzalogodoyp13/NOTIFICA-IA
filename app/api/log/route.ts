// API route: /api/log
// POST endpoint to create audit log entries
// Records user actions (login/logout) with email and timestamp
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Get current user from session
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      )
    }

    // Parse request body to get action
    const body = await request.json()
    const { action } = body

    // Validate action
    if (!action || (action !== 'login' && action !== 'logout')) {
      return NextResponse.json(
        { success: false, error: 'Acción inválida. Debe ser "login" o "logout"' },
        { status: 400 }
      )
    }

    // Create audit log entry
    const auditLog = await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: action,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: auditLog.id,
        userEmail: auditLog.userEmail,
        action: auditLog.action,
        createdAt: auditLog.createdAt,
      },
    })
  } catch (error) {
    console.error('Error creating audit log:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear el log de auditoría' },
      { status: 500 }
    )
  }
}

