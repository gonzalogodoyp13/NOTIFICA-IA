import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { ManualCustomRunSchema } from '@/lib/reports/automationCore'
import { customRunBounds, getCustomDefinition } from '@/lib/reports/customReports'
import { validateReportIdempotencyKey } from '@/lib/reports/deliveryAttempts'
import { enqueueReportJob, serializeReportJob } from '@/lib/reports/jobs'

export async function POST(request: NextRequest, { params }: { params: { definitionId: string } }) {
  return withApiUser(request, 'reports.custom_definitions.run', async user => {
    assertReportAdmin(user)
    const value = parseApiInput(ManualCustomRunSchema, await request.json().catch(() => ({})))
    const idempotencyKey = validateReportIdempotencyKey(request.headers.get('Idempotency-Key'))
    const definition = await getCustomDefinition(user.officeId, params.definitionId)
    if (!definition) throw new ApiError('NOT_FOUND', 'La definición no existe.', 404)
    if (definition.status === 'ARCHIVED') throw new ApiError('CONFLICT', 'La definición está archivada.', 409)
    const bounds = customRunBounds(value.dateFrom, value.dateTo)
    const job = await enqueueReportJob({ officeId: user.officeId, type: 'GENERATE', origin: 'MANUAL', reportKind: 'custom', customDefinitionId: definition.id, requestedByUserId: user.id, idempotencyKey, periodStart: bounds.start, periodEnd: bounds.end, periodLabel: bounds.label, payload: { deliverAfter: value.deliver } })
    return apiSuccess(serializeReportJob(job), 202)
  })
}
