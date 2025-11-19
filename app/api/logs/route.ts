// API route: /api/logs
// GET endpoint to retrieve audit logs with filtering and pagination
// Requires authentication and scopes to user's office
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Sanitize sensitive data from diff JSON (RUTs, phone numbers)
function sanitizeDiff(diff: any): any {
  if (!diff) return diff

  try {
    const jsonString = JSON.stringify(diff)
    // Replace RUTs (format: 12345678-9 or 12345678-K)
    const sanitized = jsonString
      .replace(/(\b\d{7,9}-[0-9Kk]\b)/g, '[RUT oculto]')
      .replace(/(\b\d{9,11}\b)/g, '[Teléfono oculto]')
    return JSON.parse(sanitized)
  } catch {
    // If parsing fails, return original
    return diff
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') || undefined
    const tabla = searchParams.get('tabla') || undefined
    const accion = searchParams.get('accion') || undefined
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50'))) // Enforce max 100
    const skip = (page - 1) * limit

    // Build where clause - always filter by officeId for security
    const where: any = {
      officeId: user.officeId,
    }

    if (userId) where.userId = userId
    if (tabla) where.tabla = tabla
    if (accion) where.accion = accion
    if (from && to) {
      where.createdAt = {
        gte: new Date(from),
        lte: new Date(to),
      }
    } else if (from) {
      where.createdAt = {
        gte: new Date(from),
      }
    } else if (to) {
      where.createdAt = {
        lte: new Date(to),
      }
    }

    // Get logs with user and office relations
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
          office: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.auditLog.count({ where }),
    ])

    // Sanitize sensitive data from diff fields
    const sanitizedLogs = logs.map((log) => ({
      ...log,
      diff: sanitizeDiff(log.diff),
    }))

    return NextResponse.json({
      ok: true,
      data: sanitizedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching audit logs:', error)

    // Handle Prisma connection errors (P1001 - DB unreachable)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P1001'
    ) {
      const errorMessage = 'No se pudieron obtener los registros. Intente nuevamente.'
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

    // Handle generic errors
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los logs de auditoría'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { tabla, accion, diff } = body

    if (!tabla || !accion) {
      const errorMessage = 'Tabla y accion son requeridos'
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const log = await prisma.auditLog.create({
      data: {
        userId: user.id,
        officeId: user.officeId,
        tabla,
        accion,
        diff: diff || null,
      },
    })

    return NextResponse.json({ ok: true, data: log })
  } catch (error) {
    console.error('Error creating audit log:', error)

    // Handle Prisma connection errors (P1001 - DB unreachable)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P1001'
    ) {
      const errorMessage = 'No se pudo crear el registro. Intente nuevamente.'
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

    // Handle generic errors
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el log de auditoría'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

