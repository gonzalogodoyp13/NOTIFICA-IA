import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'

import { sanitizeAuditDiff } from '@/lib/auditSanitizer'
import { withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'audit.list', async context => {
    const { searchParams } = req.nextUrl
    const source = searchParams.get('source') === 'legacy' ? 'legacy' : 'activity'
    const userId = searchParams.get('userId') || undefined
    const tabla = searchParams.get('tabla') || undefined
    const accion = searchParams.get('accion') || undefined
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10)))
    const skip = (page - 1) * limit

    if (source === 'legacy') {
      const where: Prisma.AuditLogWhereInput = {
        officeId: context.officeId,
        ...(userId ? { userId } : {}),
        ...(tabla ? { tabla } : {}),
        ...(accion ? { accion } : {}),
        ...((from || to) ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        } : {}),
      }
      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: {
            user: { select: { id: true, email: true } },
            office: { select: { id: true, nombre: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip,
        }),
        prisma.auditLog.count({ where }),
      ])
      return NextResponse.json({
        ok: true,
        source,
        data: logs.map(log => ({ ...log, source, diff: sanitizeAuditDiff(log.diff) })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      })
    }

    const where: Prisma.ActivityEventWhereInput = {
      officeId: context.officeId,
      ...(userId ? { userId } : {}),
      ...(tabla ? { OR: [{ recordType: tabla }, { module: tabla }] } : {}),
      ...(accion ? { eventType: accion } : {}),
      ...((from || to) ? {
        occurredAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        },
      } : {}),
    }
    const [events, total] = await Promise.all([
      prisma.activityEvent.findMany({
        where,
        include: {
          user: { select: { id: true, email: true } },
          office: { select: { id: true, nombre: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.activityEvent.count({ where }),
    ])
    return NextResponse.json({
      ok: true,
      source,
      data: events.map(event => ({
        ...event,
        eventSource: event.source,
        source,
        tabla: event.recordType || event.module,
        accion: event.eventType,
        diff: event.metadata,
        createdAt: event.occurredAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  })
}
