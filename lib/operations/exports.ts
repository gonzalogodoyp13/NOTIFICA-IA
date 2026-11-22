import 'server-only'
import { prisma } from '@/lib/prisma'
import { requirePlatformOwner, OperationsAccessError } from './auth'
import { troubleshooting } from './guides'

// Deliberately omit free text, stack traces, certificate subjects, user identities and document contents.
export function exportEvidence(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const result: Record<string, string> = {}
  for (const key of ['environment','release','module','operation','code','errorType','recordType','recordId']) {
    const v = source[key]
    if (typeof v === 'string' && /^[a-zA-Z0-9_.-]{1,120}$/.test(v) && !/(?:bearer|password|secret|cookie|private.key|token[=:]|pin[=:])/i.test(v)) result[key] = v
  }
  return result
}
export async function diagnosticExport(kind: string, id: string, officeId?: number) {
  const actor = await requirePlatformOwner('operations.export')
  if (officeId !== undefined && (!Number.isSafeInteger(officeId) || officeId < 1)) throw new OperationsAccessError(400, 'INVALID_OFFICE')
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new OperationsAccessError(400, 'INVALID_REFERENCE')
  const office = officeId ? { officeId } : {}
  let data: unknown
  if (kind === 'incidentes') {
    const incident = await prisma.diagnosticIncident.findFirst({ where: { id, ...(officeId ? { events: { some: office } } : {}) }, select: { id: true, status: true, severity: true, firstSeen: true, lastSeen: true, occurrences: true } })
    if (!incident) throw new OperationsAccessError(404, 'NOT_FOUND')
    const events = await prisma.diagnosticEvent.findMany({ where: { incidentId: id, ...office }, take: 101, orderBy: [{ occurredAt: 'desc' }, { reference: 'asc' }], select: { reference: true, occurredAt: true, officeId: true, requestId: true, jobId: true, evidence: true } })
    data = { incident, truncated: events.length > 100, events: events.slice(0,100).map(e => ({ ...e, evidence: exportEvidence(e.evidence) })) }
  } else if (kind === 'tokens') {
    const device = await prisma.signingDevice.findFirst({ where: { id, ...office }, select: { id: true, officeId: true, role: true, health: true, healthErrorCode: true, agentVersion: true, lastHeartbeatAt: true, certificateExpiresAt: true, revokedAt: true } })
    if (!device) throw new OperationsAccessError(404, 'NOT_FOUND')
    const attempts = await prisma.signingAttempt.findMany({ where: { deviceId: id, officeId: device.officeId }, take: 101, orderBy: [{ startedAt: 'desc' }, { id: 'asc' }], select: { id: true, result: true, errorCode: true, startedAt: true, completedAt: true, item: { select: { id: true, jobId: true } } } })
    data = { device: { ...device, healthErrorCode: device.healthErrorCode ? troubleshooting(device.healthErrorCode).code : null, agentVersion: device.agentVersion && /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-+][a-zA-Z0-9.-]{1,40})?$/.test(device.agentVersion) ? device.agentVersion : null }, truncated: attempts.length > 100, attempts: attempts.slice(0,100).map(a => ({ ...a, errorCode: troubleshooting(a.errorCode).code, safeError: troubleshooting(a.errorCode).happened })) }
  } else throw new OperationsAccessError(404, 'NOT_FOUND')
  await prisma.platformAudit.create({ data: { actorUserId: actor.id, action: 'operations.export', targetId: `${kind}/${id}`, details: { officeId: officeId ?? null, format: 'diagnostic-v1', limit: 100 } } })
  return { format: 'notifica-diagnostic-v1', generatedAt: new Date().toISOString(), scope: officeId ?? 'platform', historicalLimit: 'Solo evidencia conservada; no se reconstruyen datos ausentes.', data }
}
