import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, withApiUser } from '@/lib/api/server'
import { getRecibosDispatchHistoryDetail } from '@/lib/recibos/dispatch-history'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { batchId: string } }) {
  return withApiUser(req, 'get receipt send history detail', async user => {
    const detail = await getRecibosDispatchHistoryDetail(user.officeId, params.batchId)
    if (!detail) throw new ApiError('NOT_FOUND', 'El historial solicitado no existe.', 404)
    return apiSuccess(detail)
  })
}
