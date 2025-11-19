// API route: /api/logs/export
// GET endpoint to export audit logs in CSV or JSON format
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
    const format = searchParams.get('format') || 'json'

    // Get logs with optimized select query (lighter and faster)
    const logs = await prisma.auditLog.findMany({
      where: { officeId: user.officeId },
      select: {
        id: true,
        userId: true,
        officeId: true,
        tabla: true,
        accion: true,
        createdAt: true,
        diff: true, // Include diff for sanitization
        user: { select: { email: true } },
        office: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300, // Reduced limit for reliability
    })

    // Sanitize sensitive data from diff fields
    const sanitizedLogs = logs.map((log) => ({
      ...log,
      diff: sanitizeDiff(log.diff),
    }))

    if (format === 'csv') {
      const headers = [
        'id',
        'userId',
        'officeId',
        'tabla',
        'accion',
        'createdAt',
        'userEmail',
        'officeNombre',
      ]
      const rows = sanitizedLogs.map((l) => [
        l.id,
        l.userId,
        l.officeId,
        l.tabla,
        l.accion,
        new Date(l.createdAt).toISOString(),
        l.user?.email || '',
        l.office?.nombre || '',
      ])
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join(
        '\n'
      )

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename=audit_logs.csv',
        },
      })
    }

    // Default to JSON
    return NextResponse.json({ ok: true, data: sanitizedLogs })
  } catch (error) {
    console.error('Error exporting logs:', error)

    // Handle Prisma connection errors (P1001 - DB unreachable)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P1001'
    ) {
      const errorMessage = 'No se pudieron exportar los registros. Intente nuevamente.'
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

    const errorMessage = error instanceof Error ? error.message : 'Error al exportar los registros.'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

