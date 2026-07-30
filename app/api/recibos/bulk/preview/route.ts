import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { buildReceiptBulkPreview } from '@/lib/recibos/bulk'

const Schema = z.object({ action: z.enum(['markPaid', 'associateBoleta']), reciboIds: z.array(z.string().min(1)).min(1).max(25), fechaPago: z.string().optional(), numeroBoleta: z.string().trim().max(100).optional() })

export async function POST(req: NextRequest) {
  return withApiUser(req, 'post.recibos.bulk.preview', async user => {
  try {
    const parsed = Schema.safeParse(await req.json()); if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Datos invalidos.')
    return NextResponse.json({ ok: true, data: await buildReceiptBulkPreview(user.officeId, parsed.data) })
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error al preparar la vista previa' }, { status: 400 }) }

  })
}
