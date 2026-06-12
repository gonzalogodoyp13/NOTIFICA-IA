import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { getReceiptList } from '@/lib/recibos/query'
import { buildRecibosWorkbook } from '@/lib/recibos/xlsx'
import { recordOperationalActivity } from '@/lib/audit/operationalActivity'
import { ReceiptExportSchema } from '@/lib/validations/recibos'

export const dynamic = 'force-dynamic'

function summarize(filters: any) {
  const parts: string[] = []
  if (filters.estados?.length) parts.push(`Estado: ${filters.estados.join(', ')}`)
  if (filters.fechaEjecucionDesde || filters.fechaEjecucionHasta) parts.push(`Ejecucion: ${filters.fechaEjecucionDesde || 'inicio'} a ${filters.fechaEjecucionHasta || 'hoy'}`)
  if (filters.numeroBoleta) parts.push(`Boleta: ${filters.numeroBoleta}`)
  if (filters.montoMin !== undefined || filters.montoMax !== undefined) parts.push(`Monto: ${filters.montoMin ?? 0} a ${filters.montoMax ?? 'sin maximo'}`)
  if (filters.rol) parts.push(`ROL: ${filters.rol}`)
  return parts.join(' | ') || 'Filtros aplicados'
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()
    if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    const parsed = ReceiptExportSchema.safeParse(await req.json())
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Datos de exportacion invalidos.')
    const { filters, selection } = parsed.data
    const result = await getReceiptList(user.officeId, filters, {
      exportAll: true,
      ...(selection.mode === 'explicit' ? { reciboIds: Array.from(new Set(selection.reciboIds)) } : { excludedIds: Array.from(new Set(selection.excludedIds)) }),
    })
    if (!result.rows.length) throw new Error('No hay recibos seleccionados para exportar.')
    const workbook = await buildRecibosWorkbook(result.rows, summarize(filters))
    await recordOperationalActivity({ userId: user.id, officeId: user.officeId, eventType: 'receipt_export', reciboIds: selection.mode === 'explicit' ? selection.reciboIds : undefined, count: result.rows.length })
    return new NextResponse(workbook, { status: 200, headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="gestion-recibos.xlsx"', 'Cache-Control': 'no-store',
    } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error al exportar los recibos' }, { status: 400 })
  }
}
