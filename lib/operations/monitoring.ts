import 'server-only'
import { prisma } from '@/lib/prisma'
import { deadline } from './lifecycle'

export const serviceCatalog: Record<string, { label: string; ttl: number }> = {
  notifications: { label: 'Evaluación de alertas y comunicaciones · cada 5 min', ttl: 900 },
  app: { label: 'Aplicación · ejecución del monitor', ttl: 180 },
  database: { label: 'Base de datos · lectura transaccional', ttl: 180 },
  auth: { label: 'Autenticación · endpoint de salud', ttl: 180 },
  storage: { label: 'Storage · acceso a metadatos de buckets', ttl: 180 },
  reports: { label: 'Programador de reportes · ejecución esperada cada minuto', ttl: 180 },
  signing: { label: 'Mantenimiento de firma · ejecución esperada cada 5 min', ttl: 600 },
  replies: { label: 'Sincronizador de respuestas · ejecución esperada cada 5 min', ttl: 900 },
  activity: { label: 'Procesador de auditoría · ejecución esperada cada minuto', ttl: 180 },
}
const boundedInt = (s: string | undefined, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(Number(s)) && s ? Math.floor(Number(s)) : fallback))
export async function recordPulse(key: string, status: 'running' | 'healthy' | 'degraded' | 'critical' | 'unknown', source: string, durationMs?: number) {
  if (!serviceCatalog[key]) return
  const checkedAt = new Date(), ttlSeconds = serviceCatalog[key].ttl
  // No payloads, exception messages, credentials or user input enter telemetry.
  try {
    await deadline(prisma.$transaction(async tx => {
      await tx.operationsPulse.upsert({ where: { key }, create: { key, status, source, checkedAt, ttlSeconds, durationMs, lastSuccessAt: status === 'healthy' ? checkedAt : null }, update: { status, source, checkedAt, ttlSeconds, durationMs, ...(status === 'healthy' ? { lastSuccessAt: checkedAt } : {}) } })
      // At most one historical observation per service per minute across instances.
      const lock = await tx.$queryRaw<Array<{ ok: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${`operations-history-${key}`})) AS ok`
      if (lock[0]?.ok && status !== 'running') {
        const recent = await tx.operationsObservation.findFirst({ where: { key, checkedAt: { gt: new Date(checkedAt.getTime() - 60000) } }, select: { id: true } })
        if (!recent) await tx.operationsObservation.create({ data: { key, status, checkedAt, durationMs } })
        const days = boundedInt(process.env.OPERATIONS_HEALTH_RETENTION_DAYS, 7, 1, 30)
        await tx.$executeRaw`DELETE FROM operations_observations WHERE id IN (
          SELECT id FROM operations_observations WHERE "key" = ${key} AND "checkedAt" < NOW() - (${days} * INTERVAL '1 day') ORDER BY "checkedAt" LIMIT 100
        )`
      }
    }, { maxWait: 500, timeout: 1500 }), 2200)
  } catch { /* Monitoring must not change business results or report itself recursively. */ }
}

/** Call only after scheduler authentication. Failure to record never changes processing. */
export async function observeProcess<T>(key: string, work: () => Promise<T>, succeeded: (result: T) => boolean = () => true): Promise<T> {
  const started = Date.now()
  await recordPulse(key, 'running', 'scheduler')
  try {
    const result = await work()
    await recordPulse(key, succeeded(result) ? 'healthy' : 'degraded', 'scheduler', Date.now() - started)
    return result
  } catch (error) {
    await recordPulse(key, 'critical', 'scheduler', Date.now() - started)
    throw error
  }
}

async function readEndpoint(path: string, secret: string | undefined) {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!origin || !secret) return 'unknown' as const
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password) return 'unknown' as const
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3000)
  try {
    const response = await fetch(new URL(path, url.origin), { method: 'GET', headers: { apikey: secret, Authorization: `Bearer ${secret}` }, signal: controller.signal, redirect: 'error', cache: 'no-store' })
    // Only status is evidence; discard bucket names and provider payloads.
    await response.body?.cancel()
    return response.ok ? 'healthy' as const : 'degraded' as const
  } finally { clearTimeout(timer) }
}

/** Fixed probes only. Durable lease limits execution to once/minute across instances. */
export async function runHealthTick() {
  const claimed = await prisma.$executeRaw`
    INSERT INTO operations_pulses ("key", "status", "source", "checkedAt", "ttlSeconds")
    VALUES ('monitor-lock', 'running', 'monitor', NOW(), 60)
    ON CONFLICT ("key") DO UPDATE SET "checkedAt" = NOW()
    WHERE operations_pulses."checkedAt" < NOW() - INTERVAL '60 seconds'`
  if (!claimed) return { skipped: true }
  await Promise.all(['database', 'auth', 'storage'].map(async key => {
    const started = Date.now()
    let status: 'healthy' | 'degraded' | 'unknown' = 'unknown'
    try {
      if (key === 'database') {
        await deadline(prisma.$transaction(async tx => { await tx.$executeRaw`SET LOCAL statement_timeout = '2500ms'`; await tx.$queryRaw`SELECT 1` }, { maxWait: 500, timeout: 3000 }), 3500)
        status = 'healthy'
      } else status = await readEndpoint(key === 'auth' ? '/auth/v1/health' : '/storage/v1/bucket?limit=1', key === 'auth' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY)
    } catch { status = 'degraded' }
    await recordPulse(key, status, 'read-only probe', Date.now() - started)
  }))
  await recordPulse('app', 'healthy', 'monitor tick')
  const days = boundedInt(process.env.OPERATIONS_HEALTH_RETENTION_DAYS, 7, 1, 30)
  // Bounded deletion; includes a hard cap so disabled cleanup cannot grow indefinitely
  // once ticks resume. No business/audit history is pruned here.
  await prisma.$executeRaw`DELETE FROM operations_observations WHERE id IN (
    SELECT id FROM operations_observations WHERE "checkedAt" < NOW() - (${days} * INTERVAL '1 day') ORDER BY "checkedAt" LIMIT 2000
  )`
  return { skipped: false }
}

let publicRead: { until: number; work: Promise<boolean> } | undefined
/** Small anonymous surface: constant response, shared 10s read and bounded deadline. */
export function publicHealth() {
  if (publicRead && publicRead.until > Date.now()) return publicRead.work
  const work = deadline(prisma.operationsPulse.findMany({ where: { key: { in: ['app', 'database', 'auth', 'storage'] } }, take: 4, select: { key: true, status: true, checkedAt: true } }), 1500)
    .then(rows => rows.length === 4 && rows.every(x => x.status === 'healthy' && Date.now() >= x.checkedAt.getTime() && Date.now() - x.checkedAt.getTime() <= 180000)).catch(() => false)
  publicRead = { until: Date.now() + 10000, work }
  return work
}
