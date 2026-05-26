// API route: /api/logs
// GET endpoint to retrieve audit logs with filtering and pagination
// Requires authentication and scopes to user's office
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { sanitizeAuditDiff } from '@/lib/auditSanitizer'
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

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') || undefined
    const tabla = searchParams.get('tabla') || undefined
    const accion = searchParams.get('accion') || undefined
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const skip = (page - 1) * limit

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

    const sanitizedLogs = logs.map((log) => ({
      ...log,
      diff: sanitizeAuditDiff(log.diff),
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

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const errorMessage = 'Error al procesar la solicitud.'
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 500 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los logs de auditoria'
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
        diff: diff ? sanitizeAuditDiff(diff) as any : null,
      },
    })

    return NextResponse.json({ ok: true, data: log })
  } catch (error) {
    console.error('Error creating audit log:', error)

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

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const errorMessage = 'Error al procesar la solicitud.'
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 500 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Error al crear el log de auditoria'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}
