import { publicDesktopUpdate } from '@/lib/signing/desktopUpdate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public software metadata; no office data or device/browser credentials.
export async function GET() {
  try {
    const release = publicDesktopUpdate()
    return release ? Response.json(release, { headers: { 'Cache-Control': 'no-store' } })
      : new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
