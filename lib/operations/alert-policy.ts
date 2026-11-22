import { z } from 'zod'
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
export const alertPolicySchema = z.object({
  enabled: z.boolean().default(false), recipients: z.array(z.string().min(1).max(160)).max(20).default([]),
  timezone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }).default('America/Santiago'),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1,2,3,4,5]), start: clock.default('08:00'), end: clock.default('18:00'), digestTime: clock.default('08:00'),
  persistenceMinutes: z.number().int().min(1).max(1440).default(10), cooldownMinutes: z.number().int().min(15).max(1440).default(60), escalationMinutes: z.number().int().min(15).max(10080).default(120),
}).strict()
export type AlertPolicy = z.infer<typeof alertPolicySchema>
export const defaultAlertPolicy = () => alertPolicySchema.parse({})
export function localParts(now: Date, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday) }
}
export function inOperatingHours(now: Date, policy: AlertPolicy) {
  const p = localParts(now, policy.timezone)
  if (policy.start === policy.end) return policy.weekdays.includes(p.weekday)
  if (policy.start <= policy.end) return policy.weekdays.includes(p.weekday) && p.time >= policy.start && p.time < policy.end
  return p.time >= policy.start ? policy.weekdays.includes(p.weekday) : p.time < policy.end && policy.weekdays.includes((p.weekday + 6) % 7)
}
/** Stable prior local calendar day, including 23/25-hour DST days. */
export function digestWindow(now: Date, policy: AlertPolicy) {
  const local = localParts(now, policy.timezone)
  if (local.time < policy.digestTime) return null
  const date = new Date(`${local.date}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 1)
  const previous = date.toISOString().slice(0,10)
  function boundary(day: string) {
    let lo = Date.parse(`${day}T00:00:00Z`) - 18 * 3600000, hi = lo + 48 * 3600000
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (localParts(new Date(mid), policy.timezone).date < day) lo = mid; else hi = mid }
    return new Date(hi)
  }
  return { key: `${policy.timezone}:${previous}`, from: boundary(previous), to: boundary(local.date), date: previous }
}
export type AlertSnapshot = { status: string; firstObservedAt: Date; lastNotifiedAt: Date | null; level: number; generation: number }
export function alertTransition(previous: AlertSnapshot | null, input: { active: boolean; severity: string; pending: number; idleDevice?: boolean; scope: number; now: Date; maintenance: boolean }, policy: AlertPolicy) {
  const { now } = input
  if (!input.active) return { status: previous && !['RESOLVED','PENDING'].includes(previous.status) ? 'RECOVERY_PENDING' : 'RESOLVED', notify: false, level: previous?.level ?? 0, generation: previous?.generation ?? 1, firstObservedAt: previous?.firstObservedAt ?? now }
  const reopened = previous && ['RESOLVED','RECOVERY_PENDING'].includes(previous.status)
  const firstObservedAt = !previous || reopened ? now : previous.firstObservedAt
  const age = (now.getTime() - firstObservedAt.getTime()) / 60000
  const level = age >= policy.escalationMinutes && (input.pending > 0 || input.scope > 1) ? 1 : 0
  const status = !reopened && previous?.status === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : age >= policy.persistenceMinutes ? 'OPEN' : 'PENDING'
  const eligible = input.severity === 'critical' || level === 1
  const notify = status === 'OPEN' && eligible && !input.maintenance && inOperatingHours(now, policy) && !(input.idleDevice && input.pending === 0) && (!previous?.lastNotifiedAt || reopened || level > previous.level) && (!previous?.lastNotifiedAt || now.getTime() - previous.lastNotifiedAt.getTime() >= policy.cooldownMinutes * 60000)
  return { status, notify: !!notify, level: notify ? level : previous?.level ?? 0, generation: previous ? previous.generation + (reopened ? 1 : 0) : 1, firstObservedAt }
}
