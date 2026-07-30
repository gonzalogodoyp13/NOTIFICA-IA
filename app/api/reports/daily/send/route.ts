import { NextRequest } from 'next/server'
import { z } from 'zod'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { sendDailyReportForOffice } from '@/lib/reports/dailyDelivery'

export const dynamic = 'force-dynamic'

const SendSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa formato YYYY-MM-DD').optional(),
})

export async function POST(request: NextRequest) {
  return withApiUser(request, 'reports.daily.send', async (user) => {
    if (!user.isOfficeAdmin) throw new ApiError('UNAUTHORIZED', 'Solo un administrador de oficina puede enviar reportes.', 403)
    const input = parseApiInput(SendSchema, await request.json().catch(() => ({})))
    return apiSuccess(await sendDailyReportForOffice({
      officeId: user.officeId,
      userId: user.id,
      periodDate: input.date,
      mode: 'manual',
      requestId: user.requestId,
    }))
  })
}
