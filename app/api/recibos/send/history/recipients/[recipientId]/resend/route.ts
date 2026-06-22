import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { resendDispatch } from '@/lib/recibos/resend'
import { DispatchResendSchema } from '@/lib/validations/recibos'

export async function POST(req: NextRequest, { params }: { params: { recipientId: string } }) {
  return withApiUser(req, 'resend receipt dispatch', async user => {
    const input = parseApiInput(DispatchResendSchema, await req.json())
    return apiSuccess(await resendDispatch({ officeId: user.officeId, userId: user.id, recipientId: params.recipientId, input }))
  })
}
