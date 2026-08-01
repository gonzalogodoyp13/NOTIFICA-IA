import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, handleApiError, parseApiInput, withApiUser } from '@/lib/api/server'
import { generateReceipt } from '@/lib/recibos/generation'
import { isValidIdempotencyKey } from '@/lib/recibos/generation-core'
import { ReciboGenerateSchema } from '@/lib/validations/rol-workspace'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'receipt.generate', async user => {
    try {
      const idempotencyKey = req.headers.get('idempotency-key')?.trim() ?? ''
      if (!isValidIdempotencyKey(idempotencyKey)) {
        throw new ApiError(
          'VALIDATION_ERROR',
          'Debes enviar un encabezado Idempotency-Key valido (8 a 200 caracteres).',
          400
        )
      }

      const input = parseApiInput(ReciboGenerateSchema, await req.json().catch(() => ({})))
      const result = await generateReceipt({
        input,
        idempotencyKey,
        context: user,
        diligenciaId: params.id,
      })

      return apiSuccess(result)
    } catch (error) {
      return handleApiError(error, { operation: 'receipt.generate', request: req, user })
    }
  })
}
