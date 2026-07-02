import { NextRequest } from 'next/server'
import { z } from 'zod'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { sendMonthlyReportForOffice } from '@/lib/reports/monthlyDelivery'

export const dynamic = 'force-dynamic'

const SendSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Usa formato YYYY-MM').optional(),
})

export async function POST(request: NextRequest) {
  return withApiUser(request, 'reports.monthly.send', async (user) => {
    if (!user.isOfficeAdmin) throw new ApiError('UNAUTHORIZED', 'Solo un administrador de oficina puede enviar reportes mensuales.', 403)
    const input = parseApiInput(SendSchema, await request.json().catch(() => ({})))
    return apiSuccess(await sendMonthlyReportForOffice({
      officeId: user.officeId,
      userId: user.id,
      periodDate: input.month,
      mode: 'manual',
    }))
  })
}
