import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { sendMonthlyReportsForAllOffices } from '@/lib/reports/monthlyDelivery'
import { bearerOrHeaderSecret, isSecretAuthorized } from '@/lib/security/secret'

export const dynamic = 'force-dynamic'

const SendSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  officeId: z.number().int().positive().optional(),
})

export async function POST(req: NextRequest) {
  const expected = process.env.AUDIT_REPORT_SYNC_SECRET?.trim()
  const supplied = bearerOrHeaderSecret(req.headers, 'x-audit-report-sync-secret')
  if (!isSecretAuthorized(expected, supplied)) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = SendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos ingresados' } }, { status: 400 })
  }

  try {
    const result = await sendMonthlyReportsForAllOffices({
      periodDate: parsed.data.month,
      officeId: parsed.data.officeId,
      mode: 'scheduled',
      requestId: req.headers.get('x-request-id') ?? undefined,
    })
    return NextResponse.json({ ok: true, data: result })
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo enviar reportes mensuales' } }, { status: 500 })
  }
}
