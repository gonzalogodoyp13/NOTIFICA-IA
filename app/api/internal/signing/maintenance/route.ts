import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { maintainSigning, maintenanceAuthorized } from '@/lib/signing/maintenance'
import { signingLog } from '@/lib/signing/telemetry'
import { withRequestTiming } from '@/lib/api/requestTiming'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
export async function GET(req: NextRequest) {
  return withRequestTiming(req, 'internal.signing.maintenance', async () => {
  const correlationId = randomUUID()
  const reply = (data: unknown, status: number) => {
    signingLog('maintenance', correlationId, status)
    return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Request-Id': correlationId } })
  }
  if (!maintenanceAuthorized(process.env.CRON_SECRET, req.headers.get('authorization'))) return reply({ ok: false }, 401)
  try {
    const data = await maintainSigning()
    return reply({ ok: data.failures === 0, data }, data.failures ? 503 : 200)
  } catch { return reply({ ok: false, error: 'MAINTENANCE_UNAVAILABLE' }, 503) }
  })
}
