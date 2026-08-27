import { NextRequest } from 'next/server'

import { apiSuccess, withApiUser } from '@/lib/api/server'
import { cleanupExpiredDailyReports } from '@/lib/reports/dailyReport'
import { assertReportAdmin } from '@/lib/reports/access'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return withApiUser(request, 'reports.cleanup', async (user) => {
    assertReportAdmin(user)
    return apiSuccess(await cleanupExpiredDailyReports(user.officeId))
  })
}
