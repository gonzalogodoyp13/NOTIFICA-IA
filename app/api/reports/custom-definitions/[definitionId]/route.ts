import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { CustomDefinitionInputSchema } from '@/lib/reports/automationCore'
import { getCustomDefinition, updateCustomDefinition } from '@/lib/reports/customReports'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { definitionId: string } }) {
  return withApiUser(request, 'reports.custom_definitions.detail', async user => {
    assertReportAdmin(user)
    const definition = await getCustomDefinition(user.officeId, params.definitionId)
    if (!definition) throw new ApiError('NOT_FOUND', 'La definición no existe.', 404)
    return apiSuccess(definition)
  })
}

export async function PATCH(request: NextRequest, { params }: { params: { definitionId: string } }) {
  return withApiUser(request, 'reports.custom_definitions.update', async user => {
    assertReportAdmin(user)
    const value = parseApiInput(CustomDefinitionInputSchema, await request.json().catch(() => ({})))
    return apiSuccess(await updateCustomDefinition({ officeId: user.officeId, definitionId: params.definitionId, actorUserId: user.id, requestId: user.requestId, value }))
  })
}
