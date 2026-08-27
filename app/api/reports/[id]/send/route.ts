import { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { validateReportIdempotencyKey } from '@/lib/reports/deliveryAttempts'
import { enqueueReportDeliveryById, serializeReportJob } from '@/lib/reports/jobs'

const Schema = z.object({ target: z.enum(['all', 'failed']).default('all'), previousAttemptId: z.string().min(1).max(120).optional() }).strict().superRefine((value, context) => {
  if (value.target === 'failed' && !value.previousAttemptId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['previousAttemptId'], message: 'Se requiere el intento anterior.' })
})

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return withApiUser(request, 'reports.delivery.enqueue', async user => {
    assertReportAdmin(user)
    const value = parseApiInput(Schema, await request.json().catch(() => ({})))
    const idempotencyKey = validateReportIdempotencyKey(request.headers.get('Idempotency-Key'))
    const job = await enqueueReportDeliveryById({ officeId: user.officeId, userId: user.id, reportId: params.id, target: value.target, previousAttemptId: value.previousAttemptId, idempotencyKey })
    return apiSuccess(serializeReportJob(job), 202)
  })
}
