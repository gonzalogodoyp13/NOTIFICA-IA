import 'server-only'

import { prisma } from '@/lib/prisma'
import { getActivityBoundary } from '@/lib/dashboard/time'
import type { ActivityType, DashboardActivityEvent, DashboardActivityPayload } from '@/lib/dashboard/types'

function categoryForActivityEvent(module: string, eventType: string): Exclude<ActivityType, 'all'> | null {
  if (module === 'payments') return 'payments'
  if (module === 'emails' || eventType.includes('export')) return 'exports'
  if (module === 'documents' || module === 'recibos') return 'documents'
  if (module === 'roles') return 'cases'
  if (module === 'diligencias') return 'diligencias'
  if (module === 'notificaciones') return 'notifications'
  if (eventType.startsWith('note.')) return 'notes'
  return null
}

function hrefForActivityEvent(event: { module: string; eventType: string; rolId: string | null }) {
  if (!event.rolId) return ['recibos', 'payments', 'emails'].includes(event.module) ? '/recibos' : '/dashboard'
  if (event.module === 'documents' || event.module === 'recibos') return `/roles/${event.rolId}?tab=documentos`
  if (event.module === 'diligencias' || event.module === 'notificaciones') return `/roles/${event.rolId}?tab=diligencias`
  if (event.eventType?.startsWith?.('note.')) return `/roles/${event.rolId}?tab=notas`
  return `/roles/${event.rolId}?tab=resumen`
}

export async function loadDashboardActivity(params: {
  officeId: number
  type: ActivityType
  cursor?: number
  limit: number
}): Promise<DashboardActivityPayload> {
  const rawLimit = Math.max(params.limit * 5, 100)
  const activityEvents = await prisma.activityEvent.findMany({
    where: {
      officeId: params.officeId,
      occurredAt: { gte: getActivityBoundary() },
      ...(params.cursor ? { id: { lt: params.cursor } } : {}),
    },
    orderBy: { id: 'desc' },
    take: rawLimit,
  })
  const mapped = activityEvents
    .map(event => {
      const type = categoryForActivityEvent(event.module, event.eventType)
      if (!type || (params.type !== 'all' && params.type !== type)) return null
      return {
        id: String(event.id),
        type,
        occurredAt: event.occurredAt.toISOString(),
        title: event.description,
        detail: event.shortName,
        href: hrefForActivityEvent(event),
        rol: event.rol,
      }
    })
    .filter((event): event is DashboardActivityEvent => !!event)
    .slice(0, params.limit)
  const last = activityEvents.at(-1)
  return {
    events: mapped,
    nextCursor: last && activityEvents.length === rawLimit ? String(last.id) : null,
  }
}
