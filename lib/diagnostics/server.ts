import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { diagnosticContext } from './context'
import { diagnosticEvent, groupingKey, type DiagnosticContext, type DiagnosticEvent } from './core'
import { reportToMonitor, flushMonitor } from './monitor'
import { waitUntil } from '@vercel/functions'

let active = 0
let windowAt = 0, captured = 0
const seen = new WeakMap<object, string>()
export async function persistDiagnostic(event: DiagnosticEvent) {
  const fingerprint = createHash('sha256').update(groupingKey(event)).digest('hex')
  await prisma.$transaction(async tx => {
    const reopened = await tx.diagnosticIncident.updateMany({ where: { fingerprint, status: 'RESOLVED' }, data: { status: 'OPEN', resolvedAt: null } })
    const incident = await tx.diagnosticIncident.upsert({ where: { fingerprint },
      create: { fingerprint, firstSeen: event.timestamp, lastSeen: event.timestamp, occurrences: 1 },
      update: { lastSeen: event.timestamp, occurrences: { increment: 1 }, revision: { increment: 1 } },
    })
    if (reopened.count) await tx.platformAudit.create({ data: { action: 'incident.reopened', targetId: incident.id, details: { reference: event.reference, reason: 'Nueva ocurrencia capturada' } } })
    await tx.diagnosticEvent.create({ data: {
      reference: event.reference, incidentId: incident.id, occurredAt: event.timestamp,
      officeId: event.officeId, userId: event.userId, requestId: event.requestId!, jobId: event.jobId,
      evidence: JSON.parse(JSON.stringify(event)),
    } })
  }, { maxWait: 5000, timeout: 5000 })
}

/** Always returns a reference, even if both diagnostic sinks are unavailable. */
export async function reportUnexpected(error: unknown, context: DiagnosticContext): Promise<string> {
  const previous = error && typeof error === 'object' ? seen.get(error) : undefined
  if (previous) return previous
  const reference = randomUUID()
  if (error && typeof error === 'object') seen.set(error, reference)
  const minute = Math.floor(Date.now() / 60000)
  if (minute !== windowAt) { windowAt = minute; captured = 0 }
  const maximum = Math.max(1, Math.min(10000, Number(process.env.DIAGNOSTIC_MAX_PER_MINUTE) || 1200))
  if (active >= 8 || captured >= maximum) {
    console.warn('[diagnostics] capture capacity exceeded', reference)
    return reference
  }
  captured++
  active++
  let pending: Promise<unknown> | undefined
  try {
    const supplied = Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined))
    const event = diagnosticEvent(error, { ...diagnosticContext(), ...supplied } as DiagnosticContext, reference)
    try { reportToMonitor(event); waitUntil(flushMonitor().catch(() => false)) } catch { /* monitoring cannot fail business work */ }
    pending = persistDiagnostic(event).catch(() => { console.warn('[diagnostics] persistence unavailable', reference) })
    try { waitUntil(pending) } catch { /* ordinary Node runtimes still await below */ }
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([pending, new Promise<void>(resolve => { timer = setTimeout(resolve, 2000) })]).finally(() => { if (timer) clearTimeout(timer) })
  } catch { /* no recursive reporting */ } finally {
    // Timed-out connections still occupy their slot until they actually settle.
    if (pending) void pending.finally(() => { active-- })
    else active--
  }
  return reference
}

export async function pruneDiagnostics() {
  const days = Math.max(1, Math.min(365, Number(process.env.DIAGNOSTIC_RETENTION_DAYS) || 30))
  const cutoff = new Date(Date.now() - days * 86400_000)
  // Bounded batches; incident lifetime counts remain after evidence expires.
  const rows = await prisma.diagnosticEvent.findMany({ where: { occurredAt: { lt: cutoff } }, select: { reference: true }, take: 1000 })
  return prisma.diagnosticEvent.deleteMany({ where: { reference: { in: rows.map(r => r.reference) } } })
}
