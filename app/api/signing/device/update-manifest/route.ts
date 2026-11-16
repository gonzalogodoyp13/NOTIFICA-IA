import { publicDesktopUpdate } from '@/lib/signing/desktopUpdate'
import { NextRequest } from 'next/server'
import { withRequestTiming } from '@/lib/api/requestTiming'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public software metadata; no office data or device/browser credentials.
export async function GET(req: NextRequest) {
  return withRequestTiming(req, 'signing.device.update-manifest', async () => {
  try {
    const release = publicDesktopUpdate()
    return release ? Response.json(release, { headers: { 'Cache-Control': 'no-store' } })
      : new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  })
}
