import { NextRequest } from 'next/server'

import { apiSuccess, withApiUser } from '@/lib/api/server'
import { listReportsForOffice } from '@/lib/reports/dailyReport'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return withApiUser(request, 'reports.list', async (user) => {
    const reports = await listReportsForOffice(user.officeId)
    return apiSuccess(reports.map(report => ({
      ...report,
      periodStart: report.periodStart.toISOString(),
      periodEnd: report.periodEnd.toISOString(),
      generatedAt: report.generatedAt.toISOString(),
      expiresAt: report.expiresAt?.toISOString() ?? null,
    })))
  })
}
