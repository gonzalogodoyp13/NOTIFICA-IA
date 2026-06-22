import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { sendReceiptTest } from '@/lib/recibos/send'
import { ReceiptTestSendSchema } from '@/lib/validations/recibos'

export async function POST(req: NextRequest) {
  return withApiUser(req, 'send receipt test', async user => {
    const input = parseApiInput(ReceiptTestSendSchema, await req.json())
    return apiSuccess(await sendReceiptTest({ user: { id: user.id, officeId: user.officeId, email: user.email }, input }))
  })
}
