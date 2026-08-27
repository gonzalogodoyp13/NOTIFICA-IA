import { NextRequest } from 'next/server'

import { apiSuccess, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { listReportSchedules } from '@/lib/reports/schedules'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return withApiUser(request, 'reports.schedules.list', async user => {
    assertReportAdmin(user)
    return apiSuccess(await listReportSchedules(user.officeId))
  })
}
