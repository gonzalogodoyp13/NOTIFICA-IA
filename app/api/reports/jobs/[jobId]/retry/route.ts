import { NextRequest } from 'next/server'

import { apiSuccess, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { validateReportIdempotencyKey } from '@/lib/reports/deliveryAttempts'
import { retryReportJob, serializeReportJob } from '@/lib/reports/jobs'

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  return withApiUser(request, 'reports.jobs.retry', async user => {
    assertReportAdmin(user)
    const idempotencyKey = validateReportIdempotencyKey(request.headers.get('Idempotency-Key'))
    const job = await retryReportJob({ officeId: user.officeId, jobId: params.jobId, actorUserId: user.id, idempotencyKey })
    return apiSuccess(serializeReportJob(job), 202)
  })
}
