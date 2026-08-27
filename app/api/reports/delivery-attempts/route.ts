import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { listGlobalDeliveryAttempts } from '@/lib/reports/history'
import { ReportDeliveryHistoryQuerySchema } from '@/lib/reports/historyCore'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return withApiUser(request, 'reports.delivery_attempts.history', async user => {
    assertReportAdmin(user)
    const query = parseApiInput(ReportDeliveryHistoryQuerySchema, Object.fromEntries(request.nextUrl.searchParams))
    return apiSuccess(await listGlobalDeliveryAttempts(user.officeId, query))
  })
}
