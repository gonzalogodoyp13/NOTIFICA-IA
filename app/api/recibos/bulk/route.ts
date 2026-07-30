import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { executeReceiptBulkOperation } from '@/lib/recibos/bulk'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  action: z.enum(['markPaid', 'associateBoleta']), reciboIds: z.array(z.string().min(1)).min(1).max(25),
  fechaPago: z.string().optional(), numeroBoleta: z.string().trim().max(100).optional(), stateHash: z.string().length(64),
})

export async function POST(req: NextRequest) {
  return withApiUser(req, 'post.recibos.bulk', async user => {
  try {
    const parsed = Schema.safeParse(await req.json())
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Datos invalidos.')
    const { stateHash, ...input } = parsed.data
    return NextResponse.json({ ok: true, data: await executeReceiptBulkOperation({ officeId: user.officeId, userId: user.id, input, stateHash }) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar recibos' }, { status: 400 })
  }

  })
}
