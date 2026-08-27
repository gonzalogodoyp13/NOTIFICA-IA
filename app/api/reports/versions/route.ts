import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { listGlobalReportVersions } from '@/lib/reports/history'
import { ReportVersionHistoryQuerySchema } from '@/lib/reports/historyCore'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return withApiUser(request, 'reports.versions.history', async user => {
    assertReportAdmin(user)
    const query = parseApiInput(ReportVersionHistoryQuerySchema, Object.fromEntries(request.nextUrl.searchParams))
    return apiSuccess(await listGlobalReportVersions(user.officeId, query))
  })
}
