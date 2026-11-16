import { desktopUpdateDownload } from '@/lib/signing/desktopUpdate'
import { NextRequest } from 'next/server'
import { withRequestTiming } from '@/lib/api/requestTiming'
import { enforceRequestQuota } from '@/lib/security/rateLimit'
import { RequestSecurityError } from '@/lib/security/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The distributed software is downloadable without a GitHub login. The private
// repository and its access token remain server-side.
export async function GET(req: NextRequest) {
  return withRequestTiming(req, 'signing.device.update-download', async () => {
    try {
      await enforceRequestQuota(req.nextUrl.pathname, 'GET', { id: 'public-updates', officeId: 0 })
      return await desktopUpdateDownload()
    } catch (error) {
      return new Response(null, { status: error instanceof RequestSecurityError ? error.status : 503,
        headers: { 'Cache-Control': 'no-store', ...(error instanceof RequestSecurityError && error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) } })
    }
  })
}
