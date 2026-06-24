import 'server-only'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { getActivityBoundary } from '@/lib/dashboard/time'
import type { ActivityType, DashboardActivityEvent, DashboardActivityPayload } from '@/lib/dashboard/types'

type RawLog = {
  id: number
  tabla: string
  accion: string
  createdAt: Date
  fields: Record<string, unknown> | null
}

function categoryFor(table: string, action: string): Exclude<ActivityType, 'all'> | null {
  if (table === 'OperationalActivity') return action === 'receipt_export' ? 'exports' : 'payments'
  if (table === 'RolCausa' || table === 'Demanda') return 'cases'
  if (table === 'Diligencia') return 'diligencias'
  if (table === 'Notificacion') return 'notifications'
  if (table === 'Documento' || table === 'Recibo') return 'documents'
  if (table === 'Nota') return 'notes'
  return null
}

function categoryForActivityEvent(module: string, eventType: string): Exclude<ActivityType, 'all'> | null {
  if (module === 'payments') return 'payments'
  if (module === 'emails' || eventType.includes('export')) return 'exports'
  if (module === 'documents') return 'documents'
  if (module === 'roles') return 'cases'
  if (module === 'diligencias') return 'diligencias'
  if (module === 'notificaciones') return 'notifications'
  return null
}

function hrefForActivityEvent(event: { module: string; rolId: string | null }) {
  if (!event.rolId) return event.module === 'recibos' || event.module === 'payments' || event.module === 'emails' ? '/recibos' : '/dashboard'
  if (event.module === 'documents') return `/roles/${event.rolId}?tab=documentos`
  if (event.module === 'diligencias' || event.module === 'notificaciones') return `/roles/${event.rolId}?tab=diligencias`
  return `/roles/${event.rolId}?tab=resumen`
}

function eventText(log: RawLog, rol: string | null) {
  const verb = log.accion === 'CREATE' ? 'Se creo' : log.accion === 'DELETE' ? 'Se elimino' : 'Se actualizo'
  if (log.tabla === 'OperationalActivity') {
    const count = Number(log.fields?.count || 0)
    if (log.accion === 'bulk_payment') return { title: `Se marcaron ${count} recibos como pagados.`, detail: null }
    if (log.accion === 'bulk_boleta') return { title: `Se asocio una boleta a ${count} recibos.`, detail: String(log.fields?.numeroBoleta || '') || null }
    return { title: `Se exportaron ${count} recibos.`, detail: null }
  }
  if (log.tabla === 'Diligencia') return { title: `${verb} una diligencia${rol ? ` para el ROL ${rol}` : ''}.`, detail: null }
  if (log.tabla === 'Notificacion') return { title: `${verb} una notificacion${rol ? ` para el ROL ${rol}` : ''}.`, detail: null }
  if (log.tabla === 'Documento') {
    const documentType = String(log.fields?.tipo || '').toLowerCase()
    const label = documentType === 'recibo' ? 'un recibo' : documentType === 'estampo' ? 'un estampo' : 'un documento'
    return { title: `Se genero ${label}${rol ? ` para el ROL ${rol}` : ''}.`, detail: String(log.fields?.nombre || '') || null }
  }
  if (log.tabla === 'Recibo') return { title: `Se genero el recibo ${String(log.fields?.numeroRecibo || '').trim() || ''}.`, detail: rol ? `ROL ${rol}` : null }
  if (log.tabla === 'Nota') return { title: `${verb} una nota${rol ? ` en el ROL ${rol}` : ''}.`, detail: null }
  return { title: `${verb} el ROL ${rol || ''}.`, detail: null }
}

export async function loadDashboardActivity(params: { officeId: number; type: ActivityType; cursor?: number; limit: number }): Promise<DashboardActivityPayload> {
  const cutoff = getActivityBoundary()
  const activityEvents = await prisma.activityEvent.findMany({
    where: {
      officeId: params.officeId,
      occurredAt: { gte: cutoff },
      ...(params.cursor ? { id: { lt: params.cursor } } : {}),
    },
    orderBy: { id: 'desc' },
    take: params.limit,
  })
  const mappedActivityEvents = activityEvents
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

  if (mappedActivityEvents.length > 0) {
    const last = activityEvents[activityEvents.length - 1]
    return {
      events: mappedActivityEvents,
      nextCursor: activityEvents.length === params.limit && last ? String(last.id) : null,
    }
  }

  const typeFilter = (() => {
    switch (params.type) {
      case 'cases': return Prisma.sql`AND tabla IN ('RolCausa','Demanda')`
      case 'diligencias': return Prisma.sql`AND tabla = 'Diligencia'`
      case 'notifications': return Prisma.sql`AND tabla = 'Notificacion'`
      case 'documents': return Prisma.sql`AND tabla IN ('Documento','Recibo')`
      case 'payments': return Prisma.sql`AND tabla = 'OperationalActivity' AND accion IN ('bulk_payment','bulk_boleta')`
      case 'notes': return Prisma.sql`AND tabla = 'Nota'`
      case 'exports': return Prisma.sql`AND tabla = 'OperationalActivity' AND accion = 'receipt_export'`
      default: return Prisma.empty
    }
  })()
  const rawLimit = Math.max(params.limit * 5, 250)
  const logs = await prisma.$queryRaw<RawLog[]>(Prisma.sql`
    SELECT id, tabla, accion, "createdAt",
      jsonb_build_object(
        'id', COALESCE(diff #>> '{result,id}', diff #>> '{input,where,id}', diff #>> '{id}'),
        'rolId', COALESCE(diff #>> '{result,rolId}', diff #>> '{input,data,rolId}', diff #>> '{rolId}'),
        'diligenciaId', COALESCE(diff #>> '{result,diligenciaId}', diff #>> '{input,data,diligenciaId}'),
        'notificacionId', COALESCE(diff #>> '{result,notificacionId}', diff #>> '{input,data,notificacionId}'),
        'documentoId', COALESCE(diff #>> '{result,documentoId}', diff #>> '{input,data,documentoId}'),
        'numeroRecibo', diff #>> '{result,numeroRecibo}',
        'nombre', diff #>> '{result,nombre}',
        'tipo', diff #>> '{result,tipo}',
        'count', diff #>> '{count}',
        'numeroBoleta', diff #>> '{numeroBoleta}'
      ) AS fields
    FROM audit_logs
    WHERE "officeId" = ${params.officeId}
      AND "createdAt" >= ${cutoff}
      ${params.cursor ? Prisma.sql`AND id < ${params.cursor}` : Prisma.empty}
      AND tabla IN ('OperationalActivity','RolCausa','Demanda','Diligencia','Notificacion','Documento','Recibo','Nota')
      ${typeFilter}
    ORDER BY id DESC
    LIMIT ${rawLimit}
  `)

  const ids = (key: string) => logs.map(log => String(log.fields?.[key] || '')).filter(Boolean)
  const [roles, diligencias, notifications, documents, receipts, notes, demandas] = await Promise.all([
    prisma.rolCausa.findMany({ where: { officeId: params.officeId, id: { in: [...ids('id'), ...ids('rolId')] } }, select: { id: true, rol: true } }),
    prisma.diligencia.findMany({ where: { id: { in: [...ids('id'), ...ids('diligenciaId')] }, rol: { officeId: params.officeId } }, select: { id: true, rolId: true } }),
    prisma.notificacion.findMany({ where: { id: { in: [...ids('id'), ...ids('notificacionId')] }, diligencia: { rol: { officeId: params.officeId } } }, select: { id: true, diligencia: { select: { id: true, rolId: true } } } }),
    prisma.documento.findMany({ where: { id: { in: [...ids('id'), ...ids('documentoId')] }, rol: { officeId: params.officeId } }, select: { id: true, rolId: true, diligenciaId: true, notificacionId: true } }),
    prisma.recibo.findMany({ where: { id: { in: ids('id') }, rol: { officeId: params.officeId } }, select: { id: true, rolId: true, documentoId: true } }),
    prisma.nota.findMany({ where: { id: { in: ids('id') }, rol: { officeId: params.officeId } }, select: { id: true, rolId: true } }),
    prisma.demanda.findMany({ where: { id: { in: ids('id') }, officeId: params.officeId }, select: { id: true, roles: { select: { id: true } } } }),
  ])
  const roleMap = new Map(roles.map(role => [role.id, role.rol]))
  const entityRole = new Map<string, string>()
  const diligenciaById = new Map(diligencias.map(item => [item.id, item]))
  const notificationById = new Map(notifications.map(item => [item.id, item]))
  diligencias.forEach(item => entityRole.set(item.id, item.rolId))
  notifications.forEach(item => entityRole.set(item.id, item.diligencia.rolId))
  documents.forEach(item => entityRole.set(item.id, item.rolId))
  receipts.forEach(item => entityRole.set(item.id, item.rolId))
  notes.forEach(item => entityRole.set(item.id, item.rolId))
  demandas.forEach(item => item.roles && entityRole.set(item.id, item.roles.id))
  const emittedDocuments = new Set<string>()

  const events: DashboardActivityEvent[] = []
  let lastProcessedId: number | null = null
  for (const log of logs) {
    lastProcessedId = log.id
    const type = categoryFor(log.tabla, log.accion)
    if (!type || (params.type !== 'all' && params.type !== type)) continue
    const entityId = String(log.fields?.id || '')
    if (log.tabla === 'Documento' && log.accion !== 'CREATE') continue
    if (log.tabla === 'Documento' && emittedDocuments.has(entityId)) continue
    if (log.tabla === 'Documento') emittedDocuments.add(entityId)
    if (log.tabla === 'Recibo' && log.fields?.documentoId) continue
    const rolId = String(log.fields?.rolId || '') || entityRole.get(entityId) || null
    const rol = rolId ? roleMap.get(rolId) || null : null
    const text = eventText(log, rol)
    const resolvedNotification = notificationById.get(entityId)
    const diligenciaId = String(log.fields?.diligenciaId || '')
      || (log.tabla === 'Diligencia' ? diligenciaById.get(entityId)?.id : '')
      || resolvedNotification?.diligencia.id
      || ''
    const notificacionId = String(log.fields?.notificacionId || '')
      || (log.tabla === 'Notificacion' ? entityId : '')
    let href = rolId ? `/roles/${rolId}?tab=resumen` : '/recibos'
    if (type === 'diligencias' || type === 'notifications') href = rolId ? `/roles/${rolId}?tab=diligencias${diligenciaId ? `&diligenciaId=${diligenciaId}` : ''}${notificacionId ? `&notificacionId=${notificacionId}&step=1` : ''}` : '/dashboard'
    if (type === 'documents') href = rolId ? `/roles/${rolId}?tab=documentos` : '/recibos'
    if (type === 'notes') href = rolId ? `/roles/${rolId}?tab=notas` : '/dashboard'
    events.push({ id: String(log.id), type, occurredAt: log.createdAt.toISOString(), title: text.title, detail: text.detail, href, rol })
    if (events.length === params.limit) break
  }
  const hasMore = !!lastProcessedId && (events.length === params.limit || logs.length === rawLimit)
  return { events, nextCursor: hasMore ? String(lastProcessedId) : null }
}
