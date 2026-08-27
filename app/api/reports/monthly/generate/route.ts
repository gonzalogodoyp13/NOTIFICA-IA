import { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { validateReportIdempotencyKey } from '@/lib/reports/deliveryAttempts'
import { enqueueManualGeneration, serializeReportJob } from '@/lib/reports/jobs'

export const dynamic = 'force-dynamic'

const GenerateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Usa formato YYYY-MM'),
  force: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  return withApiUser(request, 'reports.monthly.generate', async (user) => {
    assertReportAdmin(user)
    const input = parseApiInput(GenerateSchema, await request.json().catch(() => ({})))
    const idempotencyKey = validateReportIdempotencyKey(request.headers.get('Idempotency-Key'))
    const job = await enqueueManualGeneration({ officeId: user.officeId, userId: user.id, kind: 'monthly', period: input.month, force: input.force, idempotencyKey })
    return apiSuccess(serializeReportJob(job), 202)
  })
}
