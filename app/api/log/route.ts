// API route: /api/log
// DEPRECATED: This endpoint is deprecated. Use /api/logs instead.
import { NextRequest, NextResponse } from 'next/server'

import { withRequestTiming } from '@/lib/api/requestTiming'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return withRequestTiming(request, 'deprecated.log', async () => NextResponse.json(
    { ok: false, message: 'Endpoint deprecated. Use /api/logs.', error: 'Endpoint deprecated. Use /api/logs.' },
    { status: 410 }
  ))
}
