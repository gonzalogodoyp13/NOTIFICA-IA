// API route: /api/logs/export
// GET endpoint to export audit logs in CSV or JSON format
// Requires authentication and scopes to user's office
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { recordActivityEvent } from '@/lib/audit/activityEvent'
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
    const format = searchParams.get('format') || 'json'

    const logs = await prisma.auditLog.findMany({
      where: { officeId: user.officeId },
      select: {
        id: true,
        userId: true,
        officeId: true,
        tabla: true,
        accion: true,
        createdAt: true,
        diff: true,
        user: { select: { email: true } },
        office: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })

    const sanitizedLogs = logs.map((log) => ({
      ...log,
      diff: sanitizeAuditDiff(log.diff),
    }))

    await recordActivityEvent({
      userId: user.id,
      officeId: user.officeId,
      eventType: 'audit.export',
      module: 'audit',
      result: 'success',
      recordType: 'AuditLog',
      description: 'Exportacion de auditoria generada.',
      metadata: {
        format,
        count: sanitizedLogs.length,
      },
    })

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

    return NextResponse.json({ ok: true, data: sanitizedLogs })
  } catch (error) {
    console.error('Error exporting logs:', error)

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
