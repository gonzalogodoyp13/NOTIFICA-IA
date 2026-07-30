import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { loadDashboardData } from '@/lib/dashboard/service'
import type { DashboardFilters, DashboardSection } from '@/lib/dashboard/types'

export const dynamic = 'force-dynamic'

const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}, 'Fecha invalida')
const SectionSchema = z.enum([
  'pending',
  'overdue',
  'unpaid',
  'missingEstampos',
  'recentDocuments',
])

function parseIds(values: string[]) {
  return z.array(z.coerce.number().int().positive()).parse(values)
}

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.dashboard', async user => {
  try {

    const params = req.nextUrl.searchParams
    const fechaDesde = params.get('fechaDesde') || undefined
    const fechaHasta = params.get('fechaHasta') || undefined

    if (fechaDesde) DateKeySchema.parse(fechaDesde)
    if (fechaHasta) DateKeySchema.parse(fechaHasta)
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      return NextResponse.json(
        { ok: false, error: 'La fecha desde no puede ser posterior a la fecha hasta.' },
        { status: 400 }
      )
    }

    const filters: DashboardFilters = {
      fechaDesde,
      fechaHasta,
      abogadoIds: parseIds(params.getAll('abogadoId')),
      bancoIds: parseIds(params.getAll('bancoId')),
      procuradorIds: parseIds(params.getAll('procuradorId')),
    }
    const section = params.get('section')
      ? SectionSchema.parse(params.get('section')) as DashboardSection
      : undefined

    const data = await loadDashboardData({ officeId: user.officeId, filters, section })
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Filtros invalidos.', details: error.flatten() },
        { status: 400 }
      )
    }

    console.error('[GET /api/dashboard] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'No se pudo cargar el panel operativo.' },
      { status: 500 }
    )
  }

  })
}
