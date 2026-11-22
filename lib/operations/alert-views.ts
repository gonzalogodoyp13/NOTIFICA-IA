import 'server-only'
import { prisma } from '@/lib/prisma'
import { requirePlatformOwner, OperationsAccessError } from './auth'
import { alertConfiguration } from './alert-management'
import type { OperationsView, Cell } from './types'
const cell = (value: unknown, href?: string): Cell => ({ text: value == null ? 'Sin registro' : String(value), ...(href ? { href } : {}) })
const at = (date: Date | null) => date?.toISOString() ?? 'Sin registro'
const statuses: Record<string,string> = { PENDING: 'Persistencia pendiente', OPEN: 'Abierta', ACKNOWLEDGED: 'Reconocida', RECOVERY_PENDING: 'Recuperación por verificar', RESOLVED: 'Verificada', PREVIEW: 'Vista previa · sin envío', QUEUED: 'En cola', SENDING: 'Enviando', RETRY: 'Reintento pendiente', FAILED: 'Fallido', ACCEPTED: 'Aceptado por proveedor', CANCELLED: 'Cancelado' }
export async function alertView(officeId: number | undefined, page: number): Promise<OperationsView> {
  await requirePlatformOwner()
  if (!Number.isInteger(page) || page < 1 || page > 1000 || officeId !== undefined && (!Number.isSafeInteger(officeId) || officeId < 1)) throw new OperationsAccessError(400, 'INVALID_FILTER')
  const office = officeId ? { officeId } : {}, skip = (page - 1) * 25, take = 26
  const [alerts, windows, deliveries, configuration, history] = await Promise.all([
    prisma.operationsAlert.findMany({ where: office, skip, take, orderBy: [{ lastObservedAt: 'desc' }, { key: 'asc' }] }),
    prisma.operationsMaintenance.findMany({ where: { ...(officeId ? { OR: [{ officeId }, { officeId: null }] } : {}), endsAt: { gt: new Date() }, cancelledAt: null }, skip, take, orderBy: { endsAt: 'asc' } }),
    prisma.operationsNotification.findMany({ where: officeId ? { content: { path: ['officeId'], equals: officeId } } : {}, skip, take, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, kind: true, status: true, attempts: true, createdAt: true, completedAt: true, safeCode: true, content: true } }),
    alertConfiguration(officeId),
    prisma.platformAudit.findMany({ where: { action: { startsWith: 'alerts.' }, ...(officeId ? { details: { path: ['officeId'], equals: officeId } } : {}) }, skip, take, orderBy: { createdAt: 'desc' }, select: { action: true, targetId: true, createdAt: true } }),
  ])
  const table = (title: string, columns: string[], rows: Cell[][], description?: string) => ({ title, columns, rows: rows.slice(0,25), more: rows.length > 25, description })
  return { title: 'Alertas y comunicaciones', subtitle: 'Guías deterministas · política auditable · notificaciones privadas', refreshedAt: new Date().toISOString(), configuration,
    alertActions: alerts.slice(0,25).filter(a => ['OPEN','RECOVERY_PENDING'].includes(a.status)).map(a => ({ key: a.key, status: a.status, revision: a.revision })), maintenanceActions: windows.slice(0,25).map(w => ({ id: w.id })),
    facts: [{ label: 'Envío real', value: process.env.OPERATIONS_NOTIFICATIONS_ENABLED === 'true' ? 'Habilitado en servidor; además requiere política activa y destinatarios OWNER autorizados.' : 'Desactivado en servidor. Las vistas previas nunca se envían automáticamente.' }, { label: 'Proveedor', value: process.env.SYSTEM_MAIL_PROVIDER === 'resend' && process.env.OPERATIONS_CENTER_URL ? 'Configuración de proveedor presente; no confirma entrega.' : 'Configuración pendiente: Resend explícito y URL HTTPS del Centro.' }, { label: 'Detección', value: 'Evaluación acotada por turnos. Ausencia de una fila no demuestra recuperación. Solo un cambio observado abre recuperación por verificar.' }],
    tables: [
      table('Alertas', ['Referencia','Estado','Severidad','Oficina','Primer / último reporte','Escalamiento'], alerts.map(a => [cell(a.key, a.kind === 'incident' ? `/operaciones/incidentes/${a.referenceId}` : a.key.startsWith('device:') ? `/operaciones/tokens/${a.referenceId}` : undefined), cell(statuses[a.status]), cell(a.severity), cell(a.officeId), cell(`${at(a.firstObservedAt)} / ${at(a.lastObservedAt)}`), cell(a.level)])),
      table('Mantenimiento vigente o programado', ['Ventana','Oficina','Inicio UTC','Fin UTC','Motivo'], windows.map(w => [cell(w.id),cell(w.officeId ?? 'Global'),cell(at(w.startsAt)),cell(at(w.endsAt)),cell(w.reason)])),
      table('Historial de comunicaciones', ['Referencia','Tipo','Estado','Intentos','Creación / finalización','Código','Vista previa del contenido'], deliveries.map(d => [cell(d.id),cell(d.kind),cell(statuses[d.status]),cell(d.attempts),cell(`${at(d.createdAt)} / ${at(d.completedAt)}`),cell(d.safeCode),cell((d.content as { text?: string }).text)]), 'ACCEPTED solo confirma aceptación del proveedor. Fallos de notificación no generan incidentes recursivos.'),
      table('Historial de política y mantenimiento', ['Acción','Referencia','Fecha'], history.map(h => [cell(h.action),cell(h.targetId),cell(at(h.createdAt))])),
    ] }
}
