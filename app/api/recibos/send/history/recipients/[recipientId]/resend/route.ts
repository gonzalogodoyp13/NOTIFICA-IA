import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { deliveryPresentation } from '@/lib/recibos/delivery-visibility'
import { resendDispatch } from '@/lib/recibos/resend'
import { DispatchResendSchema } from '@/lib/validations/recibos'

export async function POST(req: NextRequest, { params }: { params: { recipientId: string } }) {
  return withApiUser(req, 'resend receipt dispatch', async user => {
    const input = parseApiInput(DispatchResendSchema, await req.json())
    const result = await resendDispatch({ officeId: user.officeId, userId: user.id, requestId: user.requestId, recipientId: params.recipientId, input })
    const { provider, ...safeResult } = result
    return apiSuccess({ ...safeResult, ...deliveryPresentation(provider), ...(user.isOfficeAdmin ? { diagnostics: { provider } } : {}) })
  })
}
