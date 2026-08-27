import { NextRequest } from 'next/server'

import { apiSuccess, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { validateReportIdempotencyKey } from '@/lib/reports/deliveryAttempts'
import { cancelReportJob, serializeReportJob } from '@/lib/reports/jobs'

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  return withApiUser(request, 'reports.jobs.cancel', async user => {
    assertReportAdmin(user)
    validateReportIdempotencyKey(request.headers.get('Idempotency-Key'))
    const job = await cancelReportJob({ officeId: user.officeId, jobId: params.jobId, actorUserId: user.id, requestId: user.requestId })
    return apiSuccess(serializeReportJob(job))
  })
}
