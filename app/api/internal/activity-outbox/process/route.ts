import { NextRequest, NextResponse } from 'next/server'

import { processActivityOutbox } from '@/lib/audit/outbox'
import { withRequestTiming } from '@/lib/api/requestTiming'
import { observeProcess } from '@/lib/operations/monitoring'
import { bearerOrHeaderSecret, isSecretAuthorized } from '@/lib/security/secret'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return withRequestTiming(request, 'internal.activity-outbox.process', async () => {
    const supplied = bearerOrHeaderSecret(request.headers, 'x-activity-outbox-secret')
    if (!isSecretAuthorized(process.env.ACTIVITY_OUTBOX_SECRET, supplied)) {
      return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 })
    }

    try {
      const result = await observeProcess('activity', () => processActivityOutbox(50), result => result.claimed === result.processed)
      return NextResponse.json({ ok: true, data: result })
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo procesar la cola de actividad' } },
        { status: 500 }
      )
    }
  })
}
