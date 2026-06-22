import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { sendReceiptGroups } from '@/lib/recibos/send'
import { ReceiptSendSchema } from '@/lib/validations/recibos'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return withApiUser(req, 'send receipts', async user => {
    const input = parseApiInput(ReceiptSendSchema, await req.json())
    return apiSuccess(await sendReceiptGroups({ user, input }))
  })
}
