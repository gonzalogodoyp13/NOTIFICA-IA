import { NextRequest, NextResponse } from 'next/server'

import { ApiError, parseApiInput, withApiUser } from '@/lib/api/server'
import { recordOperationalActivity } from '@/lib/audit/operationalActivity'
import { getReceiptList } from '@/lib/recibos/query'
import { buildRecibosWorkbook } from '@/lib/recibos/xlsx'
import { ReceiptExportSchema, type ReceiptFiltersInput } from '@/lib/validations/recibos'

export const dynamic = 'force-dynamic'

function summarize(filters: ReceiptFiltersInput) {
  const parts: string[] = []
  if (filters.estados.length) parts.push(`Estado: ${filters.estados.join(', ')}`)
  if (filters.fechaEjecucionDesde || filters.fechaEjecucionHasta) parts.push(`Ejecucion: ${filters.fechaEjecucionDesde || 'inicio'} a ${filters.fechaEjecucionHasta || 'hoy'}`)
  if (filters.numeroBoleta) parts.push(`Boleta: ${filters.numeroBoleta}`)
  if (filters.montoMin !== undefined || filters.montoMax !== undefined) parts.push(`Monto: ${filters.montoMin ?? 0} a ${filters.montoMax ?? 'sin maximo'}`)
  if (filters.rol) parts.push(`ROL: ${filters.rol}`)
  return parts.join(' | ') || 'Filtros aplicados'
}

export async function POST(req: NextRequest) {
  return withApiUser(req, 'export receipts', async user => {
    const { filters, selection } = parseApiInput(ReceiptExportSchema, await req.json())
    const result = await getReceiptList(user.officeId, filters, {
      exportAll: true,
      ...(selection.mode === 'explicit'
        ? { reciboIds: Array.from(new Set(selection.reciboIds)) }
        : { excludedIds: Array.from(new Set(selection.excludedIds)) }),
    })
    if (!result.rows.length) throw new ApiError('VALIDATION_ERROR', 'No hay recibos seleccionados para exportar', 400)

    const workbook = await buildRecibosWorkbook(result.rows, summarize(filters))
    await recordOperationalActivity({
      userId: user.id,
      officeId: user.officeId,
      eventType: 'receipt_export',
      reciboIds: selection.mode === 'explicit' ? selection.reciboIds : undefined,
      count: result.rows.length,
    })
    return new NextResponse(workbook, { status: 200, headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="gestion-recibos.xlsx"',
      'Cache-Control': 'no-store',
    } })
  })
}
