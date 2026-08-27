import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { JobListQuerySchema } from '@/lib/reports/automationCore'
import { listReportJobs } from '@/lib/reports/jobs'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return withApiUser(request, 'reports.jobs.list', async user => {
    assertReportAdmin(user)
    const query = parseApiInput(JobListQuerySchema, Object.fromEntries(request.nextUrl.searchParams))
    return apiSuccess(await listReportJobs(user.officeId, query))
  })
}
