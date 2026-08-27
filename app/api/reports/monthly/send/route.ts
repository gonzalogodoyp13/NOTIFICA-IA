import { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { validateReportIdempotencyKey } from '@/lib/reports/deliveryAttempts'
import { previousChileMonthString } from '@/lib/reports/chileTime'
import { enqueueManualDelivery, serializeReportJob } from '@/lib/reports/jobs'

export const dynamic = 'force-dynamic'

const SendSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Usa formato YYYY-MM').optional(),
  target: z.enum(['all', 'failed']).optional().default('all'),
  previousAttemptId: z.string().min(1).max(120).optional(),
}).superRefine((value, context) => {
  if (value.target === 'failed' && !value.previousAttemptId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['previousAttemptId'], message: 'Retry failed requiere un intento anterior.' })
  }
})

export async function POST(request: NextRequest) {
  return withApiUser(request, 'reports.monthly.send', async user => {
    assertReportAdmin(user)
    const input = parseApiInput(SendSchema, await request.json().catch(() => ({})))
    const idempotencyKey = validateReportIdempotencyKey(request.headers.get('Idempotency-Key'))
    const job = await enqueueManualDelivery({ officeId: user.officeId, userId: user.id, kind: 'monthly', period: input.month ?? previousChileMonthString(), target: input.target, previousAttemptId: input.previousAttemptId, idempotencyKey })
    return apiSuccess(serializeReportJob(job), 202)
  })
}
