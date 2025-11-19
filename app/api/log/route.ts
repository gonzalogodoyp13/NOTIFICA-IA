// API route: /api/log
// DEPRECATED: This endpoint is deprecated. Use /api/logs instead.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(
    { ok: false, message: 'Endpoint deprecated. Use /api/logs.', error: 'Endpoint deprecated. Use /api/logs.' },
    { status: 410 }
  )
}
