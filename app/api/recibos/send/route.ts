import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { deliveryPresentation } from '@/lib/recibos/delivery-visibility'
import { sendReceiptGroups } from '@/lib/recibos/send'
import { ReceiptSendSchema } from '@/lib/validations/recibos'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return withApiUser(req, 'send receipts', async user => {
    const input = parseApiInput(ReceiptSendSchema, await req.json())
    const result = await sendReceiptGroups({ user, input })
    const { provider, ...safeResult } = result
    return apiSuccess({
      ...safeResult,
      ...deliveryPresentation(provider),
      ...(user.isOfficeAdmin ? { diagnostics: { provider } } : {}),
    })
  })
}
