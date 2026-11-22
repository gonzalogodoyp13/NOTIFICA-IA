import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuthenticatedUser, AuthResolutionError } from '@/lib/auth-server'
import { requireSameOrigin, boundRequestBody, RequestSecurityError } from '@/lib/security/request'
import { requestIdFor, withRequestTiming } from '@/lib/api/requestTiming'
import { prisma } from '@/lib/prisma'
import { reportUnexpected } from '@/lib/diagnostics/server'

const inputSchema = z.object({
  clientRelease: z.string().regex(/^[a-zA-Z0-9_.:/@-]{1,160}$/).optional(),
  errorType: z.enum(['Error', 'TypeError', 'RangeError', 'SyntaxError']),
  frames: z.array(z.string().regex(/^[a-zA-Z0-9_.-]+\.(?:[cm]?js|tsx?):\d+:\d+$/).max(160)).max(24),
}).strict()
export async function POST(request: NextRequest) {
  return withRequestTiming(request, 'diagnostics.browser', () => ingest(request))
}
async function ingest(request: NextRequest) {
  try {
    requireSameOrigin(request)
    // One fixed durable quota also covers anonymous clients; cannot grow by attacker IDs.
    const [quota] = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO device_rate_limits (key, "windowAt", count)
      VALUES ('diagnostics:browser', date_trunc('minute', now()), 1)
      ON CONFLICT (key) DO UPDATE SET count = CASE WHEN device_rate_limits."windowAt" = EXCLUDED."windowAt"
        THEN LEAST(device_rate_limits.count + 1, 1000000) ELSE 1 END, "windowAt" = EXCLUDED."windowAt" RETURNING count`
    if (!quota || quota.count > 120) return new NextResponse(null, { status: 429 })
    await boundRequestBody(request, 4096)
    const parsed = inputSchema.safeParse(await request.json())
    if (!parsed.success) return new NextResponse(null, { status: 400 })
    let user = null
    try { user = await resolveAuthenticatedUser() } catch (error) {
      if (!(error instanceof AuthResolutionError && error.status < 500)) return new NextResponse(null, { status: 503 })
    }
    const error = new Error('Browser failure')
    error.name = parsed.data.errorType
    error.stack = 'Error\n' + parsed.data.frames.map(frame => ` at /${frame}`).join('\n')
    const supportReference = await reportUnexpected(error, { module: 'browser', operation: 'browser.error', source: 'browser',
      requestId: requestIdFor(request), userId: user?.id, officeId: user?.officeId, code: 'CLIENT_REPORTED_ERROR', clientRelease: parsed.data.clientRelease })
    return NextResponse.json({ supportReference }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    // Intake never reports its own failures or echoes untrusted payloads.
    return new NextResponse(null, { status: error instanceof RequestSecurityError ? error.status : 400 })
  }
}
