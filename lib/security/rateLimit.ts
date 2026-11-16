import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { RequestSecurityError } from './request'

export function requestQuota(path: string, method: string) {
  if (method === 'POST' && path === '/api/recibos/send/test') return { group: 'test-email', seconds: 600, user: 5, office: 25 }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && /\/(send|resend|retry)$/.test(path))
    return { group: 'send', seconds: 600, user: 10, office: 50 }
  if (path === '/api/signing/device/update-download' || /\/(pdf|export|generate|preview|download|run)(\/|$)/.test(path) || /\/(recibo|estampo)$/.test(path))
    return { group: 'documents', seconds: 60, user: 30, office: 150 }
  return { group: 'api', seconds: 60, user: 240, office: 1200 }
}

export async function enforceRequestQuota(path: string, method: string, user: { id: string; officeId: number }) {
  const quota = requestQuota(path, method)
  const key = (value: string) => createHash('sha256').update(`web:${quota.group}:${value}`).digest('hex')
  const userKey = key(`user:${user.id}`), officeKey = key(`office:${user.officeId}`)
  // Atomic counters shared across instances; denied/failed operations retain
  // their counters. Existing private rate-limit table avoids schema drift.
  const rows = await prisma.$queryRaw<Array<{ key: string; count: number }>>`
    INSERT INTO device_rate_limits (key, "windowAt", count)
    SELECT k, to_timestamp(floor(extract(epoch from statement_timestamp()) / ${quota.seconds}::int) * ${quota.seconds}::int), 1
    FROM unnest(ARRAY[${userKey}, ${officeKey}]::text[]) k ORDER BY k
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN device_rate_limits."windowAt" = EXCLUDED."windowAt"
        THEN LEAST(device_rate_limits.count + 1, 1000000) ELSE 1 END,
      "windowAt" = EXCLUDED."windowAt" RETURNING key, count`
  if (rows.length !== 2) throw new RequestSecurityError('SERVICE_UNAVAILABLE', 503)
  if (rows.some(row => row.count > (row.key === userKey ? quota.user : quota.office)))
    throw new RequestSecurityError('RATE_LIMITED', 429, quota.seconds)
}
