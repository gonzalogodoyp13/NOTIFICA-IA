import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { loadDashboardActivity } from '@/lib/dashboard/activity'

export const dynamic = 'force-dynamic'
const QuerySchema = z.object({ type: z.enum(['all','cases','diligencias','notifications','documents','payments','notes','exports']).default('all'), cursor: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(50).default(50) })

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()
    if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    const query = QuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    return NextResponse.json({ ok: true, data: await loadDashboardActivity({ officeId: user.officeId, ...query }) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: 'Parametros invalidos.' }, { status: 400 })
    console.error('[GET /api/dashboard/activity]', error)
    return NextResponse.json({ ok: false, error: 'No se pudo cargar la actividad.' }, { status: 500 })
  }
}
