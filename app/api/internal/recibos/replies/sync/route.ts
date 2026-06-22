import { NextRequest, NextResponse } from 'next/server'

import { syncAllConfiguredOfficeReplies } from '@/lib/recibos/reply-sync'
import { isReplySyncAuthorized } from '@/lib/recibos/reply-tracking-core'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const expected = process.env.REPLY_SYNC_SECRET?.trim()
  const authorization = req.headers.get('authorization')
  const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : req.headers.get('x-reply-sync-secret')?.trim()
  if (!isReplySyncAuthorized(expected, supplied)) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, data: await syncAllConfiguredOfficeReplies() })
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo sincronizar las respuestas' } }, { status: 500 })
  }
}
