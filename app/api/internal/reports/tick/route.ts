import { timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'

import { ApiError, apiFailure, apiSuccess, handleApiError } from '@/lib/api/server'
import { withRequestTiming } from '@/lib/api/requestTiming'
import { runReportAutomationTick, runRequestedReportJob } from '@/lib/reports/jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TickSchema = z.union([
  z.object({ officeId: z.number().int().positive(), jobId: z.string().min(1).max(120) }).strict(),
  z.object({ maxJobs: z.number().int().min(1).max(20).optional() }).strict(),
])

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
      const parsed = TickSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) return apiFailure(new ApiError('VALIDATION_ERROR', 'Indica un trabajo y su oficina, o maxJobs.', 400))
      if ('jobId' in parsed.data) return apiSuccess(await runRequestedReportJob(parsed.data))
      return apiSuccess(await runReportAutomationTick({ maxJobs: parsed.data.maxJobs ?? 5 }))
    } catch (error) {
      return handleApiError(error, { operation: 'reports.internal.tick', request })
    }
  })
}
