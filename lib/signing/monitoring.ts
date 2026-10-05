import 'server-only'
import type { Prisma } from '@prisma/client'
import { monitoringMessages, type SigningAlert } from './operationsPolicy'
import { agentSupported } from './agentRelease'

/** Recomputed from durable state even when every agent and the scheduler is down.
 * Not affected by document date filters or pagination. No raw errors are serialized. */
export async function signingAlerts(tx: Prisma.TransactionClient, officeId: number, now: Date, admin: boolean): Promise<SigningAlert[]> {
  const alerts = new Map<string, SigningAlert>()
  function add(code: keyof typeof monitoringMessages, count = 1, critical = true) {
    if (!count) return
    const prior = alerts.get(code)
    alerts.set(code, { id: admin ? code : prior?.id ?? `alert_${alerts.size}`, message: monitoringMessages[code], severity: critical ? 'critical' : 'warning',
      count: count + (prior?.count ?? 0), ...(admin ? { diagnosticCode: code } : {}) })
  }
  const devices = await tx.signingDevice.findMany({ where: { officeId, revokedAt: null } })
  for (const device of devices) {
    if (!agentSupported(device.agentVersion)) add('AGENT_UPDATE_REQUIRED')
    if (!device.lastHeartbeatAt || now.getTime() - device.lastHeartbeatAt.getTime() > 90_000) add('AGENT_OFFLINE')
    if (device.role !== 'RECEIVER') {
      if (device.healthErrorCode === 'PIN_REQUIRED') add('REMOTE_SESSION_REQUIRED', 1, false)
      if (device.healthErrorCode === 'CERT_REVOKED') add('CERT_REVOKED')
      if (device.health === 'AGENT_ONLINE_TOKEN_MISSING') add('TOKEN_MISSING')
      if (device.health === 'DRIVER_ERROR') add('DRIVER_ERROR')
      if (device.certificateExpiresAt && device.certificateExpiresAt <= now) add('CERT_EXPIRED')
      else if (device.certificateExpiresAt && device.certificateExpiresAt.getTime() - now.getTime() <= 30 * 86400_000) add('CERT_EXPIRING', 1, false)
    }
    if (device.healthErrorCode === 'DISK' || device.diskFreeBytes !== null && device.diskFreeBytes < BigInt(64 * 1024 * 1024)) add('RECEIVER_DISK')
    else if (device.healthErrorCode && !['PIN_REQUIRED', 'MISSING', 'DRIVER_MISSING', 'DRIVER_ERROR', 'CERT_MISSING', 'CERT_INVALID', 'CERT_AMBIGUOUS', 'CERT_EXPIRED'].includes(device.healthErrorCode)) add('DEVICE_FAILURE')
  }
  const old = new Date(now.getTime() - 15 * 60_000)
  add('QUEUE_AGE', await tx.signingItem.count({ where: { officeId, createdAt: { lte: old }, status: { in: ['QUEUED', 'RETRY_PENDING', 'CLAIMED', 'SIGNING', 'WAITING_FOR_OPERATOR'] } } }), false)
  add('SIGNING_FAILURE', await tx.signingItem.count({ where: { officeId, status: { in: ['FAILED', 'WAITING_FOR_OPERATOR'] } } }))
  add('CERT_REVOKED', await tx.signingItem.count({ where: { officeId, errorCode: 'CERT_REVOKED', status: { notIn: ['COMPLETED', 'CANCELLED'] } } }))
  add('LEASE_EXPIRED', await tx.signingItem.count({ where: { officeId, status: { in: ['CLAIMED', 'SIGNING'] }, leaseExpiresAt: { lte: now } } }))
  const since = new Date(now.getTime() - 86400_000)
  add('CERT_REVOKED', await tx.activityEvent.count({ where: { officeId, eventType: 'signing.validation_failed', occurredAt: { gte: since }, metadata: { path: ['errorCode'], equals: 'CERT_REVOKED' } } }))
  for (const [code, alert] of [['TSA_UNAVAILABLE', 'TSA_FAILURE'], ['REVOCATION_UNAVAILABLE', 'REVOCATION_FAILURE']] as const) {
    const count = await tx.signingAttempt.count({ where: { officeId, errorCode: code, completedAt: { gte: since } } })
    if (count >= 2) add(alert, count)
  }
  const validation = await tx.activityEvent.count({ where: { officeId, eventType: 'signing.validation_failed', occurredAt: { gte: since } } })
  if (validation >= 2) add('VALIDATION_FAILURE', validation)
  else if (validation) add('VALIDATION_REJECTED', validation)
  // Retired per-PC delivery queues no longer represent office availability.
  add('CLEANUP_PENDING', await tx.signingArtifact.count({ where: { officeId, OR: [{ state: 'CLEANING' }, { state: 'PENDING', expiresAt: { lt: now } }] } }))
  const hasWork = devices.length > 0 || await tx.signingJob.count({ where: { officeId } }) > 0
  if (hasWork && !await tx.activityEvent.count({ where: { officeId, eventType: 'signing.maintenance_completed', occurredAt: { gte: new Date(now.getTime() - 600_000) } } })) add('MAINTENANCE_STALE')
  return Array.from(alerts.values())
}
