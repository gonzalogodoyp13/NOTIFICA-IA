import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ReceiptFilterSchema } from '@/lib/validations/recibos'
import { getReconciliation } from '@/lib/recibos/reconciliation'
import { buildReconciliationWorkbook } from '@/lib/recibos/reconciliation-xlsx'

const Schema = z.object({ filters: ReceiptFilterSchema, categories: z.array(z.enum(['RECONCILED','BOLETA_PENDING_PAYMENT','PAID_WITHOUT_BOLETA','WITHOUT_BOLETA_UNPAID'])).default([]), groupBy: z.enum(['category','bank','procurador','executionMonth','boleta']).default('category'), filterSummary: z.string().max(500).default('') })

export async function POST(req: NextRequest) {
  return withApiUser(req, 'post.recibos.reconciliation.export', async user => {
  try {
    const parsed = Schema.safeParse(await req.json()); if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Datos invalidos.')
    const report = await getReconciliation({ officeId: user.officeId, filters: parsed.data.filters, categories: parsed.data.categories, groupBy: parsed.data.groupBy, exportAll: true })
    const workbook = await buildReconciliationWorkbook({ rows: report.rows, kpis: report.kpis, groupBy: parsed.data.groupBy, filterSummary: parsed.data.filterSummary })
    return new NextResponse(workbook, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="conciliacion-recibos.xlsx"', 'Cache-Control': 'no-store' } })
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error al exportar conciliacion' }, { status: 400 }) }

  })
}
