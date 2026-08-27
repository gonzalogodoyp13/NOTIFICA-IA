import { timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

import { ApiError, apiFailure, apiSuccess, handleApiError } from '@/lib/api/server'
import { withRequestTiming } from '@/lib/api/requestTiming'
import { runReportAutomationTick } from '@/lib/reports/jobs'

export const dynamic = 'force-dynamic'

function authorized(request: NextRequest) {
  const expected = process.env.REPORT_AUTOMATION_SECRET?.trim()
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || request.headers.get('x-report-automation-secret')?.trim()
  if (!expected || !supplied) return false
  const left = Buffer.from(expected)
  const right = Buffer.from(supplied)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function POST(request: NextRequest) {
  return withRequestTiming(request, 'internal.reports.tick', async () => {
    try {
      if (!authorized(request)) return apiFailure(new ApiError('UNAUTHORIZED', 'Credencial de automatización inválida.', 401))
      const body = await request.json().catch(() => ({})) as { maxJobs?: unknown }
      const maxJobs = typeof body.maxJobs === 'number' ? Math.max(1, Math.min(Math.trunc(body.maxJobs), 20)) : 5
      return apiSuccess(await runReportAutomationTick({ maxJobs }))
    } catch (error) {
      return handleApiError(error, { operation: 'reports.internal.tick', request })
    }
  })
}
