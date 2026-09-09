import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { deliveryPresentation } from '@/lib/recibos/delivery-visibility'
import { sendReceiptTest } from '@/lib/recibos/send'
import { ReceiptTestSendSchema } from '@/lib/validations/recibos'

export async function POST(req: NextRequest) {
  return withApiUser(req, 'send receipt test', async user => {
    const input = parseApiInput(ReceiptTestSendSchema, await req.json())
    const result = await sendReceiptTest({ user, input })
    const { provider, ...safeResult } = result
    return apiSuccess({ ...safeResult, ...deliveryPresentation(provider), ...(user.isOfficeAdmin ? { diagnostics: { provider } } : {}) })
  })
}
