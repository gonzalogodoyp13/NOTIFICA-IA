import 'server-only'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requirePlatformOwner, OperationsAccessError } from './auth'
import { overallHealth, healthLabels, statusLabels, tokenState, incidentStatuses } from './policy'
import type { OperationsView, Table, Cell } from './types'
import { signingAlerts } from '@/lib/signing/monitoring'
import { agentSupported } from '@/lib/signing/agentRelease'
import { loadCoverage } from './coverage'
import { alertView } from './alert-views'
import { troubleshooting, supportedGuideCodes } from './guides'

const PAGE = 25
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v)
export const filterSchema = z.object({ office: z.coerce.number().int().positive().optional(), from: date.optional(), to: date.optional(), q: z.string().trim().max(100).default(''), state: z.enum(['QUEUED', 'CLAIMED', 'SIGNING', 'RETRY_PENDING', 'WAITING_FOR_OPERATOR', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(), status: z.enum(incidentStatuses).optional(), severity: z.enum(['error', 'critical', 'warning']).optional(), page: z.coerce.number().int().min(1).max(1000).default(1) })
type Filters = z.infer<typeof filterSchema>
const labels: Record<string, string> = { QUEUED: 'En cola', RUNNING: 'En proceso', FAILED: 'Fallido', COMPLETED: 'Completado', CANCELLED: 'Cancelado', WAITING_FOR_OPERATOR: 'Esperando intervención', PARTIAL: 'Parcial', SUCCEEDED: 'Correcto', CANCEL_REQUESTED: 'Cancelación solicitada', PERMANENT_FAILURE: 'Fallo definitivo', RETRYABLE_FAILURE: 'Fallo recuperable', OPERATOR_REQUIRED: 'Intervención requerida', LEASE_EXPIRED: 'Lease vencido', SIGNER: 'Firmante', RECEIVER: 'Receptor', SIGNER_RECEIVER: 'Firmante y receptor', critical: 'Crítica', warning: 'Advertencia', error: 'Error' }
const text = (value: unknown) => value === null || value === undefined || value === '' ? 'No disponible' : labels[String(value)] ?? String(value)
const time = (value: Date | null) => value ? value.toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'Sin registro'
const cell = (value: unknown, href?: string): Cell => ({ text: text(value), ...(href ? { href } : {}) })
const link = (kind: string, id: string | number) => `/operaciones/${kind}/${encodeURIComponent(id)}`
const officeCell = (id: number | null) => cell(id, id ? link('oficinas', id) : undefined)
const userCell = (id: string | null) => cell(id, id ? link('usuarios', id) : undefined)
const activeItems = ['QUEUED', 'CLAIMED', 'SIGNING', 'RETRY_PENDING', 'WAITING_FOR_OPERATOR'] as const
function range(f: Filters) {
  const gte = f.from ? new Date(`${f.from}T00:00:00Z`) : new Date(Date.now() - 7 * 86400000)
  const lte = f.to ? new Date(`${f.to}T23:59:59.999Z`) : new Date()
  if (gte > lte || lte.getTime() - gte.getTime() > 366 * 86400000) throw new OperationsAccessError(400, 'INVALID_DATE_RANGE')
  return { gte, lte }
}
function evidence(value: Prisma.JsonValue) {
  const e = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return { operation: text(e.operation), release: text(e.release), code: text(e.code), recordId: typeof e.recordId === 'string' ? e.recordId : null,
    technical: JSON.stringify(Object.fromEntries(['timestamp', 'environment', 'release', 'clientRelease', 'severity', 'module', 'operation', 'code', 'errorType', 'frames', 'recordType', 'recordId'].filter(k => e[k] !== undefined).map(k => [k, e[k]])), null, 2) }
}
const deviceSelect = { id: true, officeId: true, name: true, role: true, health: true, healthErrorCode: true, lastHeartbeatAt: true, agentVersion: true, certificateThumbprint: true, certificateSubject: true, certificateIssuer: true, certificateExpiresAt: true, providerType: true, revokedAt: true } satisfies Prisma.SigningDeviceSelect
const eventSelect = { reference: true, incidentId: true, officeId: true, userId: true, jobId: true, occurredAt: true, requestId: true, evidence: true } satisfies Prisma.DiagnosticEventSelect
function table(title: string, columns: string[], rows: Cell[][], description?: string): Table { return { title, columns, rows: rows.slice(0, PAGE), more: rows.length > PAGE, description } }
const eventTable = (rows: Array<Prisma.DiagnosticEventGetPayload<{ select: typeof eventSelect }>>) => table('Ocurrencias capturadas', ['Referencia / incidente', 'Cuándo', 'Oficina', 'Usuario', 'Operación · versión', 'Trabajo', 'Solicitud'], rows.map(e => [cell(e.reference, link('incidentes', e.incidentId)), cell(time(e.occurredAt)), officeCell(e.officeId), userCell(e.userId), cell(`${evidence(e.evidence).operation} · ${evidence(e.evidence).release}`), cell(e.jobId, e.jobId ? link('trabajos', e.jobId) : undefined), cell(e.requestId)]))

/** All platform reads enter here; no unauthenticated data-loader exports. */
export async function loadOperations(path: string[], raw: Record<string, string | undefined>): Promise<OperationsView> {
  const actor = await requirePlatformOwner()
  const f = filterSchema.parse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== '')))
  const dates = range(f), skip = (f.page - 1) * PAGE, take = PAGE + 1
  const [section = 'resumen', id] = path
  if (path.length > 2 || id && !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new OperationsAccessError(404, 'NOT_FOUND')
  const office = f.office ? { officeId: f.office } : {}
  // An exact support reference searches all retained evidence unless dates were explicit.
  const exactReference = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(f.q) && !f.from && !f.to
  const eventWhere: Prisma.DiagnosticEventWhereInput = { ...office, ...(!exactReference ? { occurredAt: dates } : {}) }
  const eventSearch: Prisma.DiagnosticEventWhereInput = f.q ? { OR: [{ reference: { contains: f.q } }, { jobId: { contains: f.q } }, { userId: { contains: f.q } }, { evidence: { path: ['operation'], string_contains: f.q } }, { evidence: { path: ['release'], string_contains: f.q } }] } : {}
  const view: OperationsView = { title: '', subtitle: 'Datos operacionales · acceso exclusivo de plataforma', refreshedAt: new Date().toISOString(), tables: [] }
  const incidentsWhere: Prisma.DiagnosticIncidentWhereInput = { ...(f.status ? { status: f.status } : {}), ...(f.severity ? { severity: f.severity } : {}),
    ...(f.office || f.q ? { events: { some: { ...eventWhere, ...eventSearch } } } : { lastSeen: dates }) }
  if(section==='recuperacion') {
    view.title='Recuperación segura'; view.recovery={officeId:f.office,kind:raw.kind,targetId:raw.targetId,actionId:id}
    const actions=await prisma.operationsRecovery.findMany({where:{...office,...(id?{id}:{})},take,skip:id?0:skip,orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true,action:true,targetId:true,officeId:true,status:true,safeCode:true,createdAt:true,correlationId:true,evidence:true}})
    if(id&&!actions.length)throw new OperationsAccessError(404,'NOT_FOUND')
    view.tables.push(table('Registro de acciones',['Acción','Tipo','Destino','Oficina','Estado','Código','Solicitada','Correlación'],actions.map(a=>[cell(a.id,link('recuperacion',a.id)),cell(a.action),cell(a.targetId),officeCell(a.officeId),cell(a.status),cell(a.safeCode),cell(time(a.createdAt)),cell(a.correlationId)])))
    if(id)view.facts=[{label:'Última evidencia de verificación',value:JSON.stringify(actions[0].evidence,null,2)},{label:'Límite',value:'SUCCEEDED de una conciliación significa consulta completada, no reparación. Ninguna acción resuelve incidentes automáticamente.'}]
  } else if (section === 'alertas' && !id) {
    Object.assign(view, await alertView(f.office, f.page))
  } else if (section === 'guias') {
    view.title = 'Guías de diagnóstico'
    if (id) view.guide = troubleshooting(id)
    else view.tables.push(table('Códigos y guías versionadas', ['Código','Qué pasó'], supportedGuideCodes.slice(skip, skip + take).map(code => [cell(code, link('guias',code)),cell(troubleshooting(code).happened)])))
  } else if (['trabajos', 'reportes', 'recibos', 'correos', 'salud'].includes(section)) {
    if (id && section !== 'trabajos') throw new OperationsAccessError(404, 'NOT_FOUND')
    Object.assign(view, await loadCoverage(section, id, f, dates))
  } else if (section === 'resumen') {
    view.title = 'Resumen general'
    const [open, critical, affected, failedReports, stuckReports, failedSigning, queue, failedReceipts, devices, maintenance] = await Promise.all([
      prisma.diagnosticIncident.count({ where: { ...incidentsWhere, status: { in: ['OPEN', 'INVESTIGATING', 'WAITING'] } } }),
      prisma.diagnosticIncident.count({ where: { ...incidentsWhere, status: { notIn: ['RESOLVED', 'IGNORED'] }, severity: 'critical' } }),
      prisma.$queryRaw<Array<{ offices: number; users: number }>>(Prisma.sql`SELECT count(DISTINCT "officeId")::int AS offices, count(DISTINCT "userId")::int AS users FROM diagnostic_events WHERE "occurredAt" BETWEEN ${dates.gte} AND ${dates.lte} ${f.office ? Prisma.sql`AND "officeId" = ${f.office}` : Prisma.empty}`),
      prisma.reportJob.count({ where: { ...office, status: 'FAILED', updatedAt: dates } }),
      prisma.reportJob.count({ where: { ...office, status: { in: ['RUNNING', 'CANCEL_REQUESTED'] }, leaseExpiresAt: { lt: new Date() } } }),
      prisma.signingItem.count({ where: { ...office, status: 'FAILED', updatedAt: dates } }),
      prisma.signingItem.count({ where: { ...office, status: { in: [...activeItems] } } }),
      prisma.receiptGenerationReservation.count({ where: { ...office, status: 'FAILED', updatedAt: dates } }),
      prisma.signingDevice.count({ where: { ...office, revokedAt: null } }),
      prisma.activityEvent.findFirst({ where: { ...office, eventType: 'signing.maintenance_completed' }, orderBy: { occurredAt: 'desc' }, select: { occurredAt: true } }),
    ])
    const staleDevices = await prisma.signingDevice.count({ where: { ...office, revokedAt: null, OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: new Date(Date.now() - 90000) } }] } })
    const failedEmails = await prisma.recibosDispatchBatch.count({ where: { ...office, status: { in: ['failed', 'partial'] }, createdAt: dates } })
    const [staleMaintenance] = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT count(*)::int AS count FROM (
        SELECT w."officeId" FROM (SELECT "officeId" FROM signing_devices UNION SELECT "officeId" FROM signing_jobs) w
        LEFT JOIN activity_events a ON a."officeId" = w."officeId" AND a."eventType" = 'signing.maintenance_completed'
        ${f.office ? Prisma.sql`WHERE w."officeId" = ${f.office}` : Prisma.empty}
        GROUP BY w."officeId" HAVING max(a."occurredAt") IS NULL OR max(a."occurredAt") < ${new Date(Date.now() - 600000)}
      ) stale`)
    const stale = !maintenance || staleMaintenance.count > 0 || staleDevices > 0 || !devices
    const health = overallHealth({ critical, failures: open + failedReports + failedSigning + failedReceipts + failedEmails + stuckReports, stale })
    view.stats = [{ label: 'Estado de la evidencia disponible', value: healthLabels[health], tone: health }, { label: 'Incidentes abiertos', value: open }, { label: 'Oficinas afectadas', value: affected[0]?.offices ?? 0 }, { label: 'Usuarios afectados', value: affected[0]?.users ?? 0 }, { label: 'Reportes fallidos / bloqueados', value: `${failedReports} / ${stuckReports}` }, { label: 'Firmas fallidas / pendientes', value: `${failedSigning} / ${queue}` }, { label: 'Recibos fallidos', value: failedReceipts }, { label: 'Equipos con evidencia vencida', value: `${staleDevices} / ${devices}` }]
    view.attention = [
      ...(critical ? [{ text: `${critical} incidentes críticos requieren revisión`, href: '/operaciones/incidentes?severity=critical', tone: 'critical' as const }] : []),
      ...(open ? [{ text: `${open} incidentes pendientes de investigación`, href: '/operaciones/incidentes?status=OPEN', tone: 'degraded' as const }] : []),
      ...(stuckReports ? [{ text: `${stuckReports} reportes con lease vencido`, href: '/operaciones/trabajos', tone: 'degraded' as const }] : []),
      ...(stale ? [{ text: 'Hay evidencia ausente o vencida. No se confirma la salud global.', href: '/operaciones/tokens', tone: 'unknown' as const }] : []),
    ]
    view.stats.push({ label: 'Despachos de recibos fallidos / parciales', value: failedEmails })
    view.facts = [{ label: 'Último mantenimiento de firma observado', value: time(maintenance?.occurredAt ?? null) }, { label: 'Alcance', value: 'Incidentes y fallos: período seleccionado. Colas, leases y conectividad: estado actual. No hay comprobación externa de disponibilidad.' }]
  } else if (section === 'incidentes' && !id) {
    view.title = 'Incidentes'
    const rows = await prisma.diagnosticIncident.findMany({ where: incidentsWhere, orderBy: [{ lastSeen: 'desc' }, { id: 'asc' }], skip, take, include: { events: { where: eventWhere, orderBy: { occurredAt: 'desc' }, take: 1, select: eventSelect } } })
    const counts = rows.length ? await prisma.$queryRaw<Array<{ incidentId: string; offices: number; users: number }>>(Prisma.sql`SELECT "incidentId", count(DISTINCT "officeId")::int AS offices, count(DISTINCT "userId")::int AS users FROM diagnostic_events WHERE "incidentId" IN (${Prisma.join(rows.map(r => r.id))}) ${exactReference ? Prisma.empty : Prisma.sql`AND "occurredAt" BETWEEN ${dates.gte} AND ${dates.lte}`} ${f.office ? Prisma.sql`AND "officeId" = ${f.office}` : Prisma.empty} GROUP BY "incidentId"`) : []
    view.tables.push(table('Bandeja de incidentes', ['Incidente / operación', 'Estado', 'Severidad', 'Ocurrencias totales', 'Primera / última', 'Oficinas / usuarios en período', 'Versión'], rows.map(r => { const c = counts.find(c => c.incidentId === r.id); return [cell(`${r.id} · ${evidence(r.events[0]?.evidence ?? null).operation}`, link('incidentes', r.id)), cell(statusLabels[r.status] ?? r.status), cell(r.severity), cell(r.occurrences), cell(`${time(r.firstSeen)} / ${time(r.lastSeen)}`), cell(`${c?.offices ?? 0} / ${c?.users ?? 0}`), cell(evidence(r.events[0]?.evidence ?? null).release)] })))
  } else if (section === 'incidentes' && id) {
    const incident = await prisma.diagnosticIncident.findUnique({ where: { id } })
    if (!incident) throw new OperationsAccessError(404, 'NOT_FOUND')
    view.title = 'Detalle del incidente'; view.subtitle = id
    view.incident = { id, status: incident.status, severity: incident.severity, revision: incident.revision, assignedToUserId: incident.assignedToUserId, impact: incident.impact, confirmedCause: incident.confirmedCause, suspectedCause: incident.suspectedCause, nextSteps: incident.nextSteps }
    const [events, history, owners] = await Promise.all([
      prisma.diagnosticEvent.findMany({ where: { incidentId: id, ...eventWhere, ...eventSearch }, orderBy: [{ occurredAt: 'desc' }, { reference: 'asc' }], skip, take, select: eventSelect }),
      prisma.platformAudit.findMany({ where: { targetId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take }),
      prisma.platformGrant.findMany({ where: { role: 'OWNER', revokedAt: null }, take: 25, select: { userId: true } }),
    ])
    view.stats = [{ label: 'Estado', value: statusLabels[incident.status] ?? incident.status }, { label: 'Ocurrencias de vida', value: incident.occurrences }, { label: 'Primera evidencia', value: time(incident.firstSeen) }, { label: 'Última evidencia', value: time(incident.lastSeen) }]
    view.facts = [{ label: 'Impacto documentado', value: incident.impact ?? 'No documentado' }, { label: 'Causa confirmada documentada por el propietario', value: incident.confirmedCause ?? 'Sin causa confirmada' }, { label: 'Hipótesis, sin confirmar', value: incident.suspectedCause ?? 'Sin hipótesis registradas' }, { label: 'Próximos pasos', value: incident.nextSteps ?? 'Revisar referencias, trabajos y última evidencia disponible.' }, { label: 'Propietarios asignables (ID)', value: owners.map(o => o.userId).join(', ') || 'No disponibles' }]
    view.tables.push(eventTable(events), table('Historial de resolución y notas', ['Fecha', 'Actor', 'Acción', 'Contenido'], history.map(h => [cell(time(h.createdAt)), userCell(h.actorUserId), cell(h.action), cell(JSON.stringify(h.details))])))
    view.tables.push(table('Evidencia técnica sanitizada', ['Referencia', 'Diagnóstico'], events.map(e => [cell(e.reference), cell(evidence(e.evidence).technical)]), 'La evidencia no demuestra una causa por sí sola. Los registros anteriores a la captura o fuera de retención no están disponibles.'))
  } else if (section === 'oficinas' && !id) {
    view.title = 'Oficinas'
    const offices = await prisma.office.findMany({ where: { ...(f.office ? { id: f.office } : {}), ...(f.q ? { nombre: { contains: f.q, mode: 'insensitive' } } : {}) }, orderBy: { id: 'asc' }, skip, take, select: { id: true, nombre: true, _count: { select: { users: true, signingDevices: true } } } })
    view.tables.push(table('Directorio operacional', ['Oficina', 'Usuarios', 'Equipos registrados'], offices.map(o => [cell(`${o.nombre} · ${o.id}`, link('oficinas', o.id)), cell(o._count.users), cell(o._count.signingDevices)])))
  } else if (section === 'oficinas' && id) {
    const officeId = Number(id)
    if (!Number.isSafeInteger(officeId)) throw new OperationsAccessError(404, 'NOT_FOUND')
    const o = await prisma.office.findUnique({ where: { id: officeId }, select: { nombre: true } })
    if (!o) throw new OperationsAccessError(404, 'NOT_FOUND')
    view.title = o.nombre; view.subtitle = `Oficina ${officeId}`
    const [users, events, devicesCount] = await Promise.all([
      prisma.user.findMany({ where: { officeId }, orderBy: { id: 'asc' }, skip, take, select: { id: true, email: true, isActive: true, isOfficeAdmin: true } }),
      prisma.diagnosticEvent.findMany({ where: { officeId, occurredAt: dates }, orderBy: { occurredAt: 'desc' }, skip, take, select: eventSelect }),
      prisma.signingDevice.count({ where: { officeId, revokedAt: null } }),
    ])
    view.tables.push(table('Usuarios de la oficina', ['Usuario', 'Cuenta', 'Administración de oficina'], users.map(u => [cell(u.email, link('usuarios', u.id)), cell(u.isActive ? 'Activa' : 'Desactivada'), cell(u.isOfficeAdmin ? 'Sí' : 'No') ])), eventTable(events))
    const [officeDevices, work, reports] = await Promise.all([
      prisma.signingDevice.findMany({ where: { officeId }, orderBy: { id: 'asc' }, skip, take, select: deviceSelect }),
      prisma.signingJob.findMany({ where: { officeId, status: { in: ['QUEUED', 'RUNNING', 'WAITING_FOR_OPERATOR', 'FAILED', 'PARTIAL'] } }, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, status: true } }),
      prisma.reportJob.findMany({ where: { officeId, status: { in: ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'FAILED'] } }, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, status: true } }),
    ])
    view.tables.push(table('Equipos de la oficina', ['Equipo', 'Conectividad', 'Token'], officeDevices.map(d => [cell(d.name, link('tokens', d.id)), cell(tokenState(d).connection), cell(tokenState(d).token)])), table('Firmas pendientes o fallidas', ['Trabajo', 'Estado'], work.map(j => [cell(j.id, link('trabajos', j.id)), cell(j.status)])), table('Reportes pendientes o fallidos', ['Trabajo', 'Estado'], reports.map(j => [cell(j.id, link('trabajos', j.id)), cell(j.status)])))
    view.attention = [{ text: 'Ver equipos, tokens y certificados', href: `/operaciones/tokens?office=${officeId}`, tone: 'unknown' }, { text: 'Ver trabajo pendiente', href: `/operaciones/trabajos?office=${officeId}`, tone: 'unknown' }]
    if (devicesCount <= 100) {
      const alerts = await signingAlerts(prisma, officeId, new Date(), true)
      view.tables.push(table('Alertas de firma existentes', ['Diagnóstico', 'Cantidad'], alerts.map(a => [cell(a.message), cell(a.count)]), 'Alertas calculadas con el monitor existente; revisar frescura del equipo antes de interpretar su último estado.'))
    } else view.facts = [{ label: 'Monitor de firma', value: 'Más de 100 equipos: utilice Control de tokens paginado.' }]
  } else if (section === 'usuarios' && !id) {
    view.title = 'Usuarios'
    const users = await prisma.user.findMany({ where: { ...office, ...(f.q ? { OR: [{ email: { contains: f.q, mode: 'insensitive' } }, { id: { contains: f.q } }] } : {}) }, orderBy: { id: 'asc' }, skip, take, select: { id: true, email: true, officeId: true, isActive: true } })
    view.tables.push(table('Soporte a usuarios', ['Usuario', 'Oficina', 'Cuenta'], users.map(u => [cell(u.email, link('usuarios', u.id)), officeCell(u.officeId), cell(u.isActive ? 'Activa' : 'Desactivada')])))
  } else if (section === 'usuarios' && id) {
    const u = await prisma.user.findUnique({ where: { id }, select: { email: true, officeId: true, isActive: true } })
    if (!u) throw new OperationsAccessError(404, 'NOT_FOUND')
    view.title = u.email; view.subtitle = `Usuario ${id} · oficina ${u.officeId} · ${u.isActive ? 'Activo' : 'Desactivado'}`
    const [events, actions, jobs] = await Promise.all([
      prisma.diagnosticEvent.findMany({ where: { userId: id, ...eventWhere }, orderBy: { occurredAt: 'desc' }, skip, take, select: eventSelect }),
      prisma.activityEvent.findMany({ where: { userId: id, ...office, occurredAt: dates }, orderBy: { occurredAt: 'desc' }, skip, take, select: { occurredAt: true, eventType: true, result: true, requestId: true, recordId: true } }),
      prisma.signingJob.findMany({ where: { requestedByUserId: id, ...office, createdAt: dates }, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, status: true, createdAt: true } }),
    ])
    view.tables.push(eventTable(events), table('Actividad registrada', ['Fecha', 'Acción', 'Resultado', 'Solicitud', 'Registro'], actions.map(a => [cell(time(a.occurredAt)), cell(a.eventType), cell(a.result), cell(a.requestId), cell(a.recordId)])), table('Trabajos de firma', ['Trabajo', 'Estado', 'Fecha'], jobs.map(j => [cell(j.id, link('trabajos', j.id)), cell(j.status), cell(time(j.createdAt))])))
    const reportJobs = await prisma.reportJob.findMany({ where: { requestedByUserId: id, ...office, createdAt: dates }, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, status: true, createdAt: true } })
    view.tables.push(table('Trabajos de reportes', ['Trabajo', 'Estado', 'Fecha'], reportJobs.map(j => [cell(j.id, link('trabajos', j.id)), cell(j.status), cell(time(j.createdAt))])))
    view.facts = [{ label: 'Límite del historial', value: 'Solo se muestran eventos conservados. No se reconstruyen errores, accesos ni acciones que nunca se registraron.' }]
  } else if (section === 'tokens') {
    view.title = id ? 'Equipo y evidencia de firma' : 'Control de tokens'
    const devices = await prisma.signingDevice.findMany({ where: { ...office, ...(id ? { id } : {}), ...(f.q ? { name: { contains: f.q, mode: 'insensitive' } } : {}) }, orderBy: [{ officeId: 'asc' }, { id: 'asc' }], skip: id ? 0 : skip, take: id ? 1 : take, select: deviceSelect })
    if (id && !devices.length) throw new OperationsAccessError(404, 'NOT_FOUND')
    const rows = await Promise.all(devices.map(async d => {
      const state = tokenState(d)
      const supported = !!d.agentVersion && agentSupported(d.agentVersion)
      const [success, pending] = await Promise.all([
        prisma.signingAttempt.findFirst({ where: { deviceId: d.id, result: 'SUCCEEDED' }, orderBy: { completedAt: 'desc' }, select: { completedAt: true } }),
        prisma.signingItem.aggregate({ where: { officeId: d.officeId, signerFingerprint: d.certificateThumbprint ?? '__unavailable__', status: { in: [...activeItems] } }, _count: true, _min: { createdAt: true } }),
      ])
      return [cell(d.name, link('tokens', d.id)), officeCell(d.officeId), cell(state.connection), cell(`${d.agentVersion ?? 'No reportada'}${supported ? '' : ' · versión no confirmada como compatible'}`), cell(state.token), cell(state.certificate), cell(state.pin), cell(state.ready && !supported ? 'Compatibilidad del agente pendiente' : state.readiness), cell(time(d.lastHeartbeatAt)), cell(time(success?.completedAt ?? null)), cell(d.certificateThumbprint ? `${pending._count} · más antiguo: ${time(pending._min.createdAt)}` : 'Sin certificado para asociar cola')]
    }))
    view.tables.push(table('Equipos de firma y recepción', ['Equipo', 'Oficina', 'Comunicación', 'Agente', 'Token físico', 'Certificado', 'Intervención reportada', 'Disponibilidad', 'Último heartbeat', 'Última firma correcta', 'Cola por certificado'], rows, 'La cola pertenece a la oficina/certificado y puede aparecer en varios equipos: no sume las filas. Un equipo offline no implica un token desconectado.'))
    if (id) {
      const d = devices[0]
      const [attempts, history] = await Promise.all([
        prisma.signingAttempt.findMany({ where: { deviceId: id, startedAt: dates }, orderBy: { startedAt: 'desc' }, skip, take, select: { id: true, startedAt: true, result: true, errorCode: true, item: { select: { jobId: true } } } }),
        prisma.activityEvent.findMany({ where: { officeId: d.officeId, recordId: id, eventType: { startsWith: 'device.' }, occurredAt: dates }, orderBy: { occurredAt: 'desc' }, skip, take, select: { occurredAt: true, eventType: true } }),
      ])
      view.facts = [{ label: 'Identificador del equipo', value: d.id }, { label: 'Función', value: d.role }, { label: 'Huella del certificado reportado', value: text(d.certificateThumbprint) }, { label: 'Titular / emisor', value: `${text(d.certificateSubject)} / ${text(d.certificateIssuer)}` }, { label: 'Vencimiento registrado', value: time(d.certificateExpiresAt) }, { label: 'Proveedor', value: text(d.providerType) }, { label: 'Último código del agente (puede estar vencido)', value: text(d.healthErrorCode) }, { label: 'Identidad física del token', value: 'No reportada por este protocolo. La huella identifica al certificado, no al token.' }, { label: 'Inventario de certificados', value: 'Un certificado seleccionado por equipo. Otros certificados instalados no se reportan.' }, { label: 'Historial', value: 'Se conservan eventos de cambio, no necesariamente los valores anteriores del estado. PIN y claves privadas nunca se consultan.' }]
      view.tables.push(table('Intentos recientes', ['Intento', 'Fecha', 'Resultado', 'Código', 'Trabajo'], attempts.map(a => [cell(a.id), cell(time(a.startedAt)), cell(a.result), cell(a.errorCode), cell(a.item.jobId, link('trabajos', a.item.jobId))])), table('Cambios registrados', ['Fecha', 'Evento'], history.map(h => [cell(time(h.occurredAt)), cell(h.eventType)])))
    }
  } else throw new OperationsAccessError(404, 'NOT_FOUND')
  await prisma.platformAudit.create({ data: { actorUserId: actor.id, action: 'operations.view', targetId: path.join('/') || 'resumen', details: { office: f.office ?? null, from: dates.gte.toISOString(), to: dates.lte.toISOString(), page: f.page } } })
  if (id && section === 'incidentes') {
    const latest = await prisma.diagnosticEvent.findFirst({ where: { incidentId: id, ...office }, orderBy: { occurredAt: 'desc' }, select: { evidence: true } })
    const code = latest?.evidence && typeof latest.evidence === 'object' && !Array.isArray(latest.evidence) ? latest.evidence.code : null
    const operation = latest?.evidence && typeof latest.evidence === 'object' && !Array.isArray(latest.evidence) ? latest.evidence.operation : undefined
    view.guide = troubleshooting(typeof code === 'string' ? code : null, typeof operation === 'string' ? operation : undefined)
  }
  if (id && section === 'tokens') {
    const device = await prisma.signingDevice.findFirst({ where: { id, ...office }, select: { healthErrorCode: true, health: true } })
    view.guide = troubleshooting(device?.healthErrorCode ?? device?.health)
  }
  return view
}
