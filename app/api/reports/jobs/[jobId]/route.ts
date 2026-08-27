import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { getReportJob } from '@/lib/reports/jobs'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  return withApiUser(request, 'reports.jobs.detail', async user => {
    assertReportAdmin(user)
    const job = await getReportJob(user.officeId, params.jobId)
    if (!job) throw new ApiError('NOT_FOUND', 'El trabajo no existe.', 404)
    return apiSuccess(job)
  })
}
