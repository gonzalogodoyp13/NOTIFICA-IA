import { NextRequest, NextResponse } from 'next/server'
import { withRequestTiming } from '@/lib/api/requestTiming'
import { isSecretAuthorized, bearerOrHeaderSecret } from '@/lib/security/secret'
import { runHealthTick } from '@/lib/operations/monitoring'
import { deadline } from '@/lib/operations/lifecycle'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
export async function POST(request: NextRequest) {
  return withRequestTiming(request, 'internal.operations.health', async () => {
    const secret = process.env.OPERATIONS_MONITOR_SECRET
    if (!secret || secret.length < 32 || !isSecretAuthorized(secret, bearerOrHeaderSecret(request.headers, 'x-operations-monitor-secret'))) return NextResponse.json({ ok: false }, { status: 401 })
    try { return NextResponse.json({ ok: true, ...await deadline(runHealthTick(), 20000) }) }
    catch { return NextResponse.json({ ok: false }, { status: 503 }) }
  })
}
