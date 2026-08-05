// API route: /api/ping
// Simple health check endpoint that returns {ok: true}
// Used to verify the API is working
import { NextRequest, NextResponse } from 'next/server'

import { withRequestTiming } from '@/lib/api/requestTiming'

export async function GET(request: NextRequest) {
  return withRequestTiming(request, 'ping', async () => NextResponse.json({ ok: true, msg: 'pong' }))
}

