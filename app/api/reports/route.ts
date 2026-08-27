import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { listReportHistory } from '@/lib/reports/history'
import { ReportHistoryQuerySchema } from '@/lib/reports/historyCore'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return withApiUser(request, 'reports.list', async (user) => {
    assertReportAdmin(user)
    const query = parseApiInput(ReportHistoryQuerySchema, Object.fromEntries(request.nextUrl.searchParams))
    return apiSuccess(await listReportHistory(user.officeId, query))
  })
}
