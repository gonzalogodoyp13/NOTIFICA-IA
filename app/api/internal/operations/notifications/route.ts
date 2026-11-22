import { NextRequest, NextResponse } from 'next/server'
import { withRequestTiming } from '@/lib/api/requestTiming'
import { isSecretAuthorized, bearerOrHeaderSecret } from '@/lib/security/secret'
import { notificationTick } from '@/lib/operations/notifications'
import { recordPulse } from '@/lib/operations/monitoring'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export async function POST(request: NextRequest) {
  return withRequestTiming(request, 'internal.operations.notifications', async () => {
    const secret = process.env.OPERATIONS_NOTIFICATIONS_SECRET
    if (!secret || secret.length < 32 || !isSecretAuthorized(secret, bearerOrHeaderSecret(request.headers, 'x-operations-notifications-secret'))) return NextResponse.json({ ok: false }, { status: 401 })
    try { const result = await notificationTick(); if (!('skipped' in result)) await recordPulse('notifications', 'configurationError' in result.delivery ? 'degraded' : 'healthy', 'scheduler'); return NextResponse.json({ ok: true, ...result }) }
    catch { await recordPulse('notifications', 'degraded', 'scheduler'); return NextResponse.json({ ok: false, code: 'NOTIFICATION_TICK_FAILED' }, { status: 503 }) }
  })
}
