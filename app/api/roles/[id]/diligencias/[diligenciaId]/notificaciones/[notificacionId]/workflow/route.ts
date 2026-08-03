import { NextRequest } from 'next/server'

import { ApiError, apiFailure, apiSuccess, handleApiError, withApiUser } from '@/lib/api/server'
import { loadReceiptWorkflow } from '@/lib/workflow/receiptWorkflow'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; diligenciaId: string; notificacionId: string } }
) {
  return withApiUser(req, 'notification.workflow.read', async user => {
    try {
      const workflow = await loadReceiptWorkflow({
        rolId: params.id,
        diligenciaId: params.diligenciaId,
        notificacionId: params.notificacionId,
        officeId: user.officeId,
        officeCacheRevision: user.officeCacheRevision,
        includeEstampoContent: req.nextUrl.searchParams.get('detail') === 'stamp',
      })
      if (!workflow) {
        return apiFailure(new ApiError('NOT_FOUND', 'Flujo de notificacion no encontrado o incompleto', 404))
      }
      return apiSuccess(workflow)
    } catch (error) {
      return handleApiError(error, { operation: 'notification.workflow.read', request: req, user })
    }
  })
}
