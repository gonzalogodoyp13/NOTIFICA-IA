import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withRequestTiming } from '@/lib/api/requestTiming'
import { prisma } from '@/lib/prisma'
import { chileMonthBounds, previousChileMonthString } from '@/lib/reports/chileTime'
import { enqueueReportJob, serializeReportJob } from '@/lib/reports/jobs'
import { bearerOrHeaderSecret, isSecretAuthorized } from '@/lib/security/secret'

export const dynamic = 'force-dynamic'

const SendSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  officeId: z.number().int().positive().optional(),
})

export async function POST(req: NextRequest) {
  return withRequestTiming(req, 'internal.reports.monthly.send', async () => {
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
      const period = parsed.data.month ?? previousChileMonthString()
      const bounds = chileMonthBounds(period)
      const offices = parsed.data.officeId ? [{ id: parsed.data.officeId }] : await prisma.office.findMany({ where: { users: { some: { isActive: true, isOfficeAdmin: true } } }, select: { id: true }, orderBy: { id: 'asc' } })
      const jobs = []
      for (const office of offices) jobs.push(serializeReportJob(await enqueueReportJob({ officeId: office.id, type: 'GENERATE', origin: 'SCHEDULED', reportKind: 'monthly', idempotencyKey: `legacy-scheduled:monthly:${office.id}:${period}`, periodStart: bounds.start, periodEnd: bounds.end, periodLabel: period, payload: { deliverAfter: true } })))
      return NextResponse.json({ ok: true, data: { period, officeCount: offices.length, jobs } }, { status: 202 })
    } catch {
      return NextResponse.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'No se pudo enviar reportes mensuales' } }, { status: 500 })
    }
  })
}
