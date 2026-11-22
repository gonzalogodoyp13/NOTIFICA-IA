export const incidentStatuses = ['OPEN', 'INVESTIGATING', 'WAITING', 'RESOLVED', 'IGNORED'] as const
export const statusLabels: Record<string, string> = { OPEN: 'Abierto', INVESTIGATING: 'En investigación', WAITING: 'En espera', RESOLVED: 'Resuelto', IGNORED: 'Ignorado' }
export type PlatformPermission = 'operations.read' | 'incidents.write' | 'operations.export' | 'alerts.manage' | `recovery.${import('./recovery-policy').RecoveryAction}`
/** Future roles must be explicitly mapped here; unknown roles deny all access. */
export function permits(role: string | null | undefined, permission: PlatformPermission) {
  return role === 'OWNER' && ['operations.read', 'incidents.write', 'operations.export', 'alerts.manage', 'recovery.diagnostics','recovery.reconcile','recovery.signing.retry','recovery.signing.cancel','recovery.report.retry','recovery.report.cancel','recovery.device.revoke'].includes(permission)
}
export type Health = 'healthy' | 'degraded' | 'critical' | 'unknown'
export const healthLabels: Record<Health, string> = { healthy: 'Operativo', degraded: 'Con problemas', critical: 'Crítico', unknown: 'Sin evidencia reciente' }
export function overallHealth(input: { critical: number; failures: number; stale: boolean }): Health {
  if (input.critical) return 'critical'
  if (input.failures) return 'degraded'
  return input.stale ? 'unknown' : 'healthy'
}
export function tokenState(device: { role: string; revokedAt: Date | null; lastHeartbeatAt: Date | null; health: string; healthErrorCode: string | null; certificateExpiresAt: Date | null }, now = new Date()) {
  const age = device.lastHeartbeatAt ? now.getTime() - device.lastHeartbeatAt.getTime() : Infinity
  const fresh = age >= 0 && age <= 90000 && !device.revokedAt
  const connection = device.revokedAt ? 'Revocado' : !device.lastHeartbeatAt ? 'Sin comunicación registrada' : age > 90000 ? 'Sin conexión / evidencia vencida' : age < 0 ? 'Hora de agente no válida' : 'En línea'
  const applicable = device.role !== 'RECEIVER'
  const token = !applicable ? 'No aplica: receptor' : !fresh ? 'Desconocido actualmente' : device.health === 'AGENT_ONLINE_TOKEN_MISSING' ? 'Token ausente (reportado)' : ['TOKEN_READY', 'CERT_EXPIRING', 'CERT_EXPIRED'].includes(device.health) ? 'Token detectado' : 'Detección no confirmada'
  const certificate = !applicable ? 'No aplica' : device.certificateExpiresAt && device.certificateExpiresAt <= now ? 'Vencido según fecha registrada' : !fresh ? 'Estado actual desconocido' : device.healthErrorCode === 'CERT_REVOKED' ? 'Revocado (reportado)' : !device.certificateExpiresAt ? 'No disponible' : device.certificateExpiresAt.getTime() - now.getTime() < 30 * 86400000 ? 'Próximo a vencer' : 'Vigente según fecha registrada'
  const pin = fresh && device.healthErrorCode?.startsWith('PIN_') ? device.healthErrorCode : 'Sin estado de PIN confirmado'
  const ready = applicable && fresh && ['TOKEN_READY', 'CERT_EXPIRING'].includes(device.health) && !device.healthErrorCode && !!device.certificateExpiresAt && device.certificateExpiresAt > now
  return { fresh, connection, token, certificate, pin, ready, readiness: !applicable ? 'Solo recepción' : ready ? 'Listo según último reporte' : 'Firma no confirmada como disponible' }
}
