import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { loadQuickActions } from '@/lib/dashboard/actions'
import type { DashboardFilters } from '@/lib/dashboard/types'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  kind: z.enum(['continue', 'missingRecibo', 'missingEstampo']),
  sort: z.enum(['recent', 'oldest', 'overdue']).default('recent'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(10).default(10),
})
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
})

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.dashboard.actions', async user => {
  try {
    const params = req.nextUrl.searchParams
    const query = QuerySchema.parse(Object.fromEntries(params))
    const fechaDesde = params.get('fechaDesde') || undefined
    const fechaHasta = params.get('fechaHasta') || undefined
    if (fechaDesde) DateSchema.parse(fechaDesde)
    if (fechaHasta) DateSchema.parse(fechaHasta)
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      return NextResponse.json({ ok: false, error: 'La fecha desde no puede ser posterior a la fecha hasta.' }, { status: 400 })
    }
    const parseIds = (key: string) => z.array(z.coerce.number().int().positive()).parse(params.getAll(key))
    const filters: DashboardFilters = {
      fechaDesde,
      fechaHasta,
      abogadoIds: parseIds('abogadoId'),
      bancoIds: parseIds('bancoId'),
      procuradorIds: parseIds('procuradorId'),
    }
    const data = await loadQuickActions({ officeId: user.officeId, filters, ...query })
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: 'Parametros invalidos.' }, { status: 400 })
    console.error('[GET /api/dashboard/actions]', error)
    return NextResponse.json({ ok: false, error: 'No se pudo cargar la cola.' }, { status: 500 })
  }

  })
}
