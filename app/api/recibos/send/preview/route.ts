import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { buildReceiptSendPreview } from '@/lib/recibos/send'
import { ReceiptSendPreviewSchema } from '@/lib/validations/recibos'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return withApiUser(req, 'preview receipt send', async user => {
    const input = parseApiInput(ReceiptSendPreviewSchema, await req.json())
    const preview = await buildReceiptSendPreview(user, input)
    if (!preview.groups.length) throw new ApiError('VALIDATION_ERROR', 'No hay destinatarios para los recibos seleccionados.', 400)
    return apiSuccess(preview)
  })
}
