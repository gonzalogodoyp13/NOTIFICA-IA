import { NextRequest, NextResponse } from 'next/server'

import { withApiUser } from '@/lib/api/server'
import { recordCriticalEvent } from '@/lib/audit/activityEvent'
import { sanitizeAuditDiff } from '@/lib/auditSanitizer'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET(req: NextRequest) {
  return withApiUser(req, 'audit.export', async context => {
    const format = req.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'json'
    const source = req.nextUrl.searchParams.get('source') === 'legacy' ? 'legacy' : 'activity'

    const rows = await prisma.$transaction(async tx => {
      const exported = source === 'legacy'
        ? (await tx.auditLog.findMany({
            where: { officeId: context.officeId },
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
          })).map(log => ({
            id: log.id,
            userId: log.userId,
            officeId: log.officeId,
            tabla: log.tabla,
            accion: log.accion,
            createdAt: log.createdAt,
            diff: sanitizeAuditDiff(log.diff),
            userEmail: log.user.email,
            officeNombre: log.office.nombre,
          }))
        : (await tx.activityEvent.findMany({
            where: { officeId: context.officeId },
            select: {
              id: true,
              userId: true,
              officeId: true,
              eventType: true,
              module: true,
              recordType: true,
              occurredAt: true,
              metadata: true,
              requestId: true,
              user: { select: { email: true } },
              office: { select: { nombre: true } },
            },
            orderBy: { occurredAt: 'desc' },
            take: 300,
          })).map(event => ({
            id: event.id,
            userId: event.userId,
            officeId: event.officeId,
            tabla: event.recordType || event.module,
            accion: event.eventType,
            createdAt: event.occurredAt,
            diff: event.metadata,
            requestId: event.requestId,
            userEmail: event.user?.email || 'Sistema',
            officeNombre: event.office.nombre,
          }))

      await recordCriticalEvent(tx, context, {
        eventType: 'audit.export',
        module: 'audit',
        result: 'success',
        recordType: source === 'legacy' ? 'AuditLog' : 'ActivityEvent',
        description: 'Exportacion de auditoria generada.',
        metadata: { format, source, count: exported.length },
      })
      return exported
    })

    if (format === 'csv') {
      const headers = ['id', 'userId', 'officeId', 'tabla', 'accion', 'createdAt', 'userEmail', 'officeNombre']
      const body = rows.map(row => [
        row.id,
        row.userId,
        row.officeId,
        row.tabla,
        row.accion,
        row.createdAt.toISOString(),
        row.userEmail,
        row.officeNombre,
      ].map(csvCell).join(','))
      return new Response([headers.join(','), ...body].join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=audit_${source}.csv`,
        },
      })
    }

    return NextResponse.json({ ok: true, source, data: rows })
  })
}
