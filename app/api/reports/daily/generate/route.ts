import { NextRequest } from 'next/server'
import { z } from 'zod'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { generateDailyReport } from '@/lib/reports/dailyReport'

export const dynamic = 'force-dynamic'

const GenerateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa formato YYYY-MM-DD'),
  force: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  return withApiUser(request, 'reports.daily.generate', async (user) => {
    if (!user.isOfficeAdmin) throw new ApiError('UNAUTHORIZED', 'Solo un administrador de oficina puede generar reportes.', 403)
    const input = parseApiInput(GenerateSchema, await request.json().catch(() => ({})))
    const result = await generateDailyReport({
      officeId: user.officeId,
      userId: user.id,
      date: input.date,
      force: input.force,
      requestId: user.requestId,
    })

    if (result.status === 'no_activity') {
      return apiSuccess({
        status: result.status,
        periodDate: result.periodDate,
        periodStart: result.periodStart.toISOString(),
        periodEnd: result.periodEnd.toISOString(),
      })
    }

    return apiSuccess({
      status: result.status,
      report: {
        id: result.report.id,
        reportType: result.report.reportType,
        periodDate: result.report.periodDate,
        status: result.report.status,
        fileName: result.report.fileName,
        sizeBytes: result.report.sizeBytes,
        activityCount: result.report.activityCount,
        generatedAt: result.report.generatedAt.toISOString(),
        expiresAt: result.report.expiresAt?.toISOString() ?? null,
      },
    })
  })
}
