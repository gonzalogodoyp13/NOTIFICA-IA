import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, withApiUser } from '@/lib/api/server'
import { cleanupExpiredDailyReports } from '@/lib/reports/dailyReport'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return withApiUser(request, 'reports.cleanup', async (user) => {
    if (!user.isOfficeAdmin) throw new ApiError('UNAUTHORIZED', 'Solo un administrador de oficina puede limpiar reportes.', 403)
    return apiSuccess(await cleanupExpiredDailyReports(user.officeId))
  })
}
