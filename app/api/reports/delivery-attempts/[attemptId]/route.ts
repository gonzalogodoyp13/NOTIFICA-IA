import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { getDeliveryAttemptDetail } from '@/lib/reports/history'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { attemptId: string } }) {
  return withApiUser(request, 'reports.delivery_attempts.detail', async user => {
    assertReportAdmin(user)
    const attempt = await getDeliveryAttemptDetail(user.officeId, params.attemptId)
    if (!attempt) throw new ApiError('NOT_FOUND', 'El intento solicitado no existe.', 404)
    return apiSuccess(attempt)
  })
}
