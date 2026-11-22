import { NextRequest, NextResponse } from 'next/server'
import { withRequestTiming } from '@/lib/api/requestTiming'
import { publicHealth } from '@/lib/operations/monitoring'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  return withRequestTiming(request, 'public.health', async () => {
    const ok = await publicHealth()
    return NextResponse.json({ status: ok ? 'ok' : 'unavailable' }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
  })
}
