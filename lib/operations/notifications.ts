import 'server-only'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSystemMailAdapter } from '@/lib/email/system-mailer'
import { tokenState } from './policy'
import { alertPolicySchema, alertTransition, defaultAlertPolicy, digestWindow, inOperatingHours, type AlertPolicy } from './alert-policy'

export async function policyFor(officeId: number | null) {
  const rows = await prisma.operationsPolicy.findMany({ where: { key: { in: ['global', ...(officeId ? [`office:${officeId}`] : [])] } }, take: 2 })
  const row = rows.find(r => r.key === `office:${officeId}`) ?? rows.find(r => r.key === 'global')
  return row ? alertPolicySchema.parse(row.settings) : defaultAlertPolicy()
}
function deliveryEnabled(policy: AlertPolicy) { return policy.enabled && policy.recipients.length > 0 && process.env.OPERATIONS_NOTIFICATIONS_ENABLED === 'true' }
function privateBase() {
  const value = process.env.OPERATIONS_CENTER_URL
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null } catch { return null }
}
export type Notice = { subject: string; text: string; path: string; officeId: number | null; generation?: number; deliveryHash?: string }
export function renderNotice(notice: Notice, base: string) {
  if (!/^\/operaciones(?:\/[a-zA-Z0-9_-]+)*(?:\?office=\d+)?$/.test(notice.path)) throw new Error('INVALID_PRIVATE_LINK')
  return { subject: notice.subject, text: `${notice.text}\n\nCentro privado (requiere propietario y MFA): ${base}${notice.path}\nNo responda con documentos, claves ni PINs.`, attachments: [] }
}
async function enqueue(tx: Prisma.TransactionClient, key: string, kind: string, referenceId: string | null, policy: AlertPolicy, notice: Notice) {
  const enabled = deliveryEnabled(policy), status = enabled ? 'QUEUED' : 'PREVIEW'
  const recipients = await tx.platformGrant.findMany({ where: { userId: { in: policy.recipients }, role: 'OWNER', revokedAt: null, user: { isActive: true } }, take: 20, select: { userId: true } })
  if (!recipients.length) return false
  await tx.operationsNotification.createMany({ data: recipients.map(r => ({ dedupeKey: createHash('sha256').update(`${key}:${r.userId}:${status}`).digest('hex'), recipientId: r.userId, kind, referenceId, status, content: notice as unknown as Prisma.InputJsonValue })), skipDuplicates: true })
  return enabled
}
type Signal = { key: string; kind: string; referenceId: string; officeId: number | null; active: boolean; severity: string; pending: number; scope: number; idleDevice?: boolean; count: number; path: string }
async function evaluateSignal(signal: Signal, now: Date) {
  const policy = await policyFor(signal.officeId)
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${signal.key}))`
    const previous = await tx.operationsAlert.findUnique({ where: { key: signal.key } })
    if (!signal.active && !previous) return
    const maintenance = !!await tx.operationsMaintenance.findFirst({ where: { cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now }, OR: [{ officeId: null }, ...(signal.officeId ? [{ officeId: signal.officeId }] : [])] }, select: { id: true } })
    const next = alertTransition(previous, { ...signal, now, maintenance }, policy)
    const evidence = { count: signal.count, pending: signal.pending, affectedOffices: signal.scope, path: signal.path, maintenance, observedAt: now.toISOString() }
    let notified = false
    if (next.notify) notified = await enqueue(tx, `${signal.key}:${next.generation}:${next.level}`, 'critical', signal.key, policy, { subject: `Notifica IA · ${next.level ? 'Escalamiento' : 'Alerta crítica'}`, text: `Tipo: ${signal.kind}. Severidad: ${signal.severity}. Oficina: ${signal.officeId ?? 'varias / plataforma'}. Registros afectados: ${signal.count}. Trabajo pendiente: ${signal.pending}. Causa sin confirmar; revise evidencia en el Centro.`, path: signal.path, officeId: signal.officeId, generation: next.generation })
    const { notify: _, ...fields } = next
    await tx.operationsAlert.upsert({ where: { key: signal.key }, create: { key: signal.key, kind: signal.kind, referenceId: signal.referenceId, officeId: signal.officeId, severity: signal.severity, lastObservedAt: now, evidence, ...fields, ...(notified ? { lastNotifiedAt: now } : {}) }, update: { ...fields, kind: signal.kind, officeId: signal.officeId, severity: signal.severity, evidence, lastObservedAt: now, revision: { increment: 1 }, ...(notified ? { lastNotifiedAt: now } : {}) } })
    if (previous?.status !== next.status) await tx.platformAudit.create({ data: { action: 'alert.transition', targetId: signal.key, details: { previous: previous?.status ?? null, next: next.status, generation: next.generation, maintenance } } })
  }, { maxWait: 2000, timeout: 10000 })
}
export async function digestContent(officeId: number | null, from: Date, to: Date) {
  const office = officeId ? { officeId } : {}, incidentOffice = officeId ? { events: { some: office } } : {}
  const [newIncidents, unresolved, affected, failedReports, stuckReports, failedSigning, stuckSigning, certificates, recovery, emails, failedReceipts, stuckReceipts, missed] = await Promise.all([
    prisma.diagnosticIncident.count({ where: { ...incidentOffice, firstSeen: { gte: from, lt: to } } }),
    prisma.diagnosticIncident.count({ where: { ...incidentOffice, status: { notIn: ['RESOLVED','IGNORED'] } } }),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT count(DISTINCT "officeId")::int AS count FROM diagnostic_events WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to} ${officeId ? Prisma.sql`AND "officeId" = ${officeId}` : Prisma.empty}`),
    prisma.reportJob.count({ where: { ...office, status: 'FAILED', updatedAt: { gte: from, lt: to } } }),
    prisma.reportJob.count({ where: { ...office, status: { in: ['RUNNING','CANCEL_REQUESTED'] }, leaseExpiresAt: { lt: new Date() } } }),
    prisma.signingItem.count({ where: { ...office, status: 'FAILED', updatedAt: { gte: from, lt: to } } }),
    prisma.signingItem.count({ where: { ...office, status: { in: ['CLAIMED','SIGNING'] }, leaseExpiresAt: { lt: new Date() } } }),
    prisma.signingDevice.count({ where: { ...office, revokedAt: null, certificateExpiresAt: { lte: new Date(to.getTime() + 30 * 86400000) } } }),
    prisma.operationsAlert.count({ where: { ...office, status: 'RECOVERY_PENDING' } }),
    prisma.recibosDispatchBatch.count({ where: { ...office, status: { in: ['failed','partial'] }, createdAt: { gte: from, lt: to } } }),
    prisma.receiptGenerationReservation.count({ where: { ...office, status: 'FAILED', updatedAt: { gte: from, lt: to } } }),
    prisma.receiptGenerationReservation.count({ where: { ...office, status: { in: ['RESERVED','UPLOADED'] }, updatedAt: { lt: new Date(Date.now() - 900000) } } }),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT count(*)::int AS count FROM report_schedules WHERE enabled AND "nextRunAt" + ("latenessThresholdMinutes" * INTERVAL '1 minute') < NOW() ${officeId ? Prisma.sql`AND "officeId" = ${officeId}` : Prisma.empty}`),
  ])
  return { newIncidents, unresolved, affectedOffices: affected[0]?.count ?? 0, failedReports, stuckReports, failedSigning, stuckSigning, certificates, recovery, emails, failedReceipts, stuckReceipts, missedRuns: missed[0]?.count ?? 0 }
}
export function digestText(date: string, zone: string, from: Date, to: Date, counts: Awaited<ReturnType<typeof digestContent>>) {
  return `Resumen diario · ${date} (${zone})\nVentana de eventos: ${from.toISOString()} hasta ${to.toISOString()} (fin excluido).\nIncidentes nuevos: ${counts.newIncidents}. Sin resolver ahora: ${counts.unresolved}. Oficinas afectadas en la ventana: ${counts.affectedOffices}.\nReportes fallidos: ${counts.failedReports}; claims vencidos ahora: ${counts.stuckReports}. Firmas fallidas: ${counts.failedSigning}; claims vencidos ahora: ${counts.stuckSigning}. Despachos fallidos/parciales: ${counts.emails}.\nCertificados vencidos o próximos a vencer en 30 días: ${counts.certificates}. Recuperaciones pendientes de verificación: ${counts.recovery}.\nRecibos fallidos: ${counts.failedReceipts}; reservas sin avance ahora: ${counts.stuckReceipts}. Programaciones vencidas ahora: ${counts.missedRuns}.\nLos totales de estado actual son una instantánea al preparar este resumen. Aceptación de correo no significa entrega al buzón.`
}
async function queueDigest(officeId: number | null, now: Date) {
  const policy = await policyFor(officeId), window = digestWindow(now, policy)
  if (!window || !policy.recipients.length) return
  const key = `digest:${officeId ?? 'global'}:${window.key}`
  // Frozen content is retained on dedupe conflicts; retries never recompute the window.
  const existing = await prisma.operationsNotification.findFirst({ where: { kind: 'digest', referenceId: key, status: deliveryEnabled(policy) ? { not: 'PREVIEW' } : 'PREVIEW' }, select: { id: true } })
  if (existing) return
  const counts = await digestContent(officeId, window.from, window.to)
  await prisma.$transaction(tx => enqueue(tx, key, 'digest', key, policy, { subject: `Notifica IA · Resumen ${window.date}`, text: digestText(window.date, policy.timezone, window.from, window.to, counts), path: `/operaciones${officeId ? `?office=${officeId}` : ''}`, officeId }))
}
/** Bounded round-robin passes; absence from a page never implies recovery. */
export async function evaluateAlerts(now = new Date()) {
  const cursorRow = await prisma.operationsPolicy.findUnique({ where: { key: 'evaluation-cursor' } })
  const cursor = cursorRow?.settings as { office?: number; incident?: string; device?: string } | undefined
  const [offices, incidents, devices] = await Promise.all([
    prisma.office.findMany({ where: { id: { gt: cursor?.office ?? 0 } }, take: 10, orderBy: { id: 'asc' }, select: { id: true } }),
    prisma.diagnosticIncident.findMany({ where: { id: { gt: cursor?.incident ?? '' } }, take: 25, orderBy: { id: 'asc' }, select: { id: true, status: true, severity: true, occurrences: true } }),
    prisma.signingDevice.findMany({ where: { id: { gt: cursor?.device ?? '' } }, take: 25, orderBy: { id: 'asc' }, select: { id: true, officeId: true, lastHeartbeatAt: true, revokedAt: true, certificateThumbprint: true, role: true, health: true, healthErrorCode: true, certificateExpiresAt: true } }),
  ])
  let incidentDone = 0, deviceDone = 0, officeDone = 0
  let budgetEnds = Date.now() + 30000
  for (const incident of incidents) {
    if (Date.now() > budgetEnds) break
    const [scope] = await prisma.$queryRaw<Array<{ count: number; office: number | null }>>`SELECT count(DISTINCT "officeId")::int AS count, min("officeId") AS office FROM diagnostic_events WHERE "incidentId" = ${incident.id}`
    const officeId = scope?.count === 1 ? scope.office : null
    await evaluateSignal({ key: `incident:${incident.id}`, kind: 'incident', referenceId: incident.id, officeId, active: !['RESOLVED','IGNORED'].includes(incident.status), severity: incident.severity, pending: 0, scope: scope?.count ?? 0, count: incident.occurrences, path: `/operaciones/incidentes/${incident.id}` }, now)
    incidentDone++
  }
  budgetEnds = Date.now() + 30000
  for (const device of devices) {
    if (Date.now() > budgetEnds) break
    const pending = device.certificateThumbprint ? await prisma.signingItem.count({ where: { officeId: device.officeId, signerFingerprint: device.certificateThumbprint, status: { in: ['QUEUED','CLAIMED','SIGNING','RETRY_PENDING','WAITING_FOR_OPERATOR'] } } }) : 0
    const state = tokenState(device, now)
    const active = !device.revokedAt && (!state.fresh || device.role !== 'RECEIVER' && !state.ready)
    await evaluateSignal({ key: `device:${device.id}`, kind: !state.fresh ? 'AGENT_OFFLINE' : device.healthErrorCode ?? device.health, referenceId: device.id, officeId: device.officeId, active, severity: 'error', pending, scope: 1, idleDevice: true, count: 1, path: `/operaciones/tokens/${device.id}` }, now)
    deviceDone++
  }
  budgetEnds = Date.now() + 30000
  for (const office of offices) {
    if (Date.now() > budgetEnds) break
    const [signing, reports, missed, email] = await Promise.all([
      prisma.signingItem.count({ where: { officeId: office.id, status: { in: ['CLAIMED','SIGNING'] }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] } }),
      prisma.reportJob.count({ where: { officeId: office.id, status: { in: ['RUNNING','CANCEL_REQUESTED'] }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] } }),
      prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM report_schedules WHERE "officeId" = ${office.id} AND enabled AND "nextRunAt" + ("latenessThresholdMinutes" * INTERVAL '1 minute') < ${now}`,
      prisma.recibosDispatchBatch.count({ where: { officeId: office.id, status: { in: ['prepared','sending'] }, completedAt: null, createdAt: { lt: new Date(now.getTime() - 900000) } } }),
    ])
    for (const [kind, section, count] of [['LEASE_EXPIRED','trabajos',signing], ['REPORT_STALLED','reportes',reports], ['SCHEDULE_MISSED','reportes',missed[0]?.count ?? 0], ['EMAIL_STALLED','correos',email]] as const) await evaluateSignal({ key: `${kind}:${office.id}`, kind, referenceId: String(office.id), officeId: office.id, active: count > 0, severity: 'error', pending: count, scope: 1, count, path: `/operaciones/${section}?office=${office.id}` }, now)
    // Office schedules are opt-in; global digest is independent.
    if (await prisma.operationsPolicy.findUnique({ where: { key: `office:${office.id}` }, select: { key: true } })) await queueDigest(office.id, now)
    officeDone++
  }
  await queueDigest(null, now)
  await prisma.operationsPolicy.upsert({ where: { key: 'evaluation-cursor' }, create: { key: 'evaluation-cursor', settings: { office: officeDone === offices.length && offices.length < 10 ? 0 : offices[officeDone-1]?.id ?? cursor?.office ?? 0, incident: incidentDone === incidents.length && incidents.length < 25 ? '' : incidents[incidentDone-1]?.id ?? cursor?.incident ?? '', device: deviceDone === devices.length && devices.length < 25 ? '' : devices[deviceDone-1]?.id ?? cursor?.device ?? '' } }, update: { settings: { office: officeDone === offices.length && offices.length < 10 ? 0 : offices[officeDone-1]?.id ?? cursor?.office ?? 0, incident: incidentDone === incidents.length && incidents.length < 25 ? '' : incidents[incidentDone-1]?.id ?? cursor?.incident ?? '', device: deviceDone === devices.length && devices.length < 25 ? '' : devices[deviceDone-1]?.id ?? cursor?.device ?? '' } } })
  return { offices: officeDone, incidents: incidentDone, devices: deviceDone }
}
export async function dispatchNotifications(now = new Date()) {
  if (process.env.OPERATIONS_NOTIFICATIONS_ENABLED !== 'true') return { sent: 0, disabled: true }
  // Resend supplies stable idempotency. Do not silently fall back to customer SMTP.
  if (process.env.SYSTEM_MAIL_PROVIDER !== 'resend' || !privateBase()) return { sent: 0, configurationError: true }
  const rows = await prisma.operationsNotification.findMany({ where: { status: { in: ['QUEUED','RETRY','SENDING'] }, availableAt: { lte: now }, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - 300000) } }] }, take: 3, orderBy: [{ availableAt: 'asc' }, { id: 'asc' }] })
  let sent = 0
  for (const row of rows) {
    const notice = row.content as unknown as Notice
    const policy = await policyFor(notice.officeId)
    const owner = await prisma.platformGrant.findFirst({ where: { userId: row.recipientId, role: 'OWNER', revokedAt: null, user: { isActive: true } }, select: { user: { select: { email: true } } } })
    if (!owner || !policy.enabled || !policy.recipients.includes(row.recipientId)) { await prisma.operationsNotification.update({ where: { id: row.id }, data: { status: 'CANCELLED', safeCode: 'RECIPIENT_OR_POLICY_DISABLED' } }); continue }
    if (row.kind === 'critical') {
      const alert = row.referenceId ? await prisma.operationsAlert.findUnique({ where: { key: row.referenceId } }) : null
      if (!alert || alert.status !== 'OPEN' || alert.generation !== notice.generation) { await prisma.operationsNotification.update({ where: { id: row.id }, data: { status: 'CANCELLED', safeCode: 'ALERT_NO_LONGER_ACTIONABLE' } }); continue }
      const maintenance = await prisma.operationsMaintenance.findFirst({ where: { cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now }, OR: [{ officeId: null }, ...(notice.officeId ? [{ officeId: notice.officeId }] : [])] }, select: { id: true } })
      if (maintenance || !inOperatingHours(now, policy)) { await prisma.operationsNotification.update({ where: { id: row.id }, data: { availableAt: new Date(now.getTime() + 900000) } }); continue }
    }
    if (row.attempts >= 3 || now.getTime() - row.createdAt.getTime() > 20 * 3600000) { await prisma.operationsNotification.update({ where: { id: row.id }, data: { status: 'FAILED', safeCode: 'RETRY_WINDOW_EXPIRED' } }); continue }
    const deliveryHash = createHash('sha256').update(JSON.stringify([owner.user.email, privateBase(), process.env.SYSTEM_MAIL_FROM_EMAIL ?? 'contacto@notificaia.cl', process.env.SYSTEM_MAIL_FROM_NAME ?? 'NOTIFICA IA'])).digest('hex')
    if (notice.deliveryHash && notice.deliveryHash !== deliveryHash) { await prisma.operationsNotification.update({ where: { id: row.id }, data: { status: 'FAILED', safeCode: 'DELIVERY_CONTEXT_CHANGED' } }); continue }
    const claimed = await prisma.operationsNotification.updateMany({ where: { id: row.id, attempts: row.attempts, status: row.status, claimedAt: row.claimedAt }, data: { status: 'SENDING', claimedAt: now, attempts: { increment: 1 }, content: { ...notice, deliveryHash } } })
    if (!claimed.count) continue
    try {
      await createSystemMailAdapter().send({ ...renderNotice(notice, privateBase()!), to: [owner.user.email], idempotencyKey: `operations-${row.id}` })
      await prisma.operationsNotification.update({ where: { id: row.id }, data: { status: 'ACCEPTED', completedAt: new Date(), claimedAt: null, safeCode: null } }); sent++
    } catch {
      await prisma.operationsNotification.update({ where: { id: row.id }, data: { status: row.attempts >= 2 ? 'FAILED' : 'RETRY', safeCode: 'NOTIFICATION_PROVIDER_FAILURE', claimedAt: null, availableAt: new Date(Date.now() + 60000 * 2 ** row.attempts) } })
      // Deliberately no reportUnexpected: notification failures must not alert themselves.
    }
  }
  return { sent }
}
export async function notificationTick() {
  const claimed = await prisma.$executeRaw`INSERT INTO operations_policies (key,settings,revision,"updatedAt") VALUES ('notification-lock','{}',0,NOW()) ON CONFLICT (key) DO UPDATE SET "updatedAt"=NOW() WHERE operations_policies."updatedAt" < NOW() - INTERVAL '5 minutes'`
  if (!claimed) return { skipped: true }
  const evaluated = await evaluateAlerts()
  const delivery = await dispatchNotifications()
  return { evaluated, delivery }
}
