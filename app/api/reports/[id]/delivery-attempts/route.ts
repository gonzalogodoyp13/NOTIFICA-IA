import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { listReportDeliveryAttempts } from '@/lib/reports/deliveryAttempts'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return withApiUser(request, 'reports.delivery_attempts.list', async user => {
    assertReportAdmin(user)
    const attempts = await listReportDeliveryAttempts(user.officeId, params.id)
    if (!attempts) throw new ApiError('NOT_FOUND', 'El reporte solicitado no existe.', 404)
    return apiSuccess(attempts)
  })
}
