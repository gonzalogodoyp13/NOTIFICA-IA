import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { CustomDefinitionInputSchema } from '@/lib/reports/automationCore'
import { createCustomDefinition, listCustomDefinitions } from '@/lib/reports/customReports'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return withApiUser(request, 'reports.custom_definitions.list', async user => {
    assertReportAdmin(user)
    return apiSuccess(await listCustomDefinitions(user.officeId))
  })
}

export async function POST(request: NextRequest) {
  return withApiUser(request, 'reports.custom_definitions.create', async user => {
    assertReportAdmin(user)
    const value = parseApiInput(CustomDefinitionInputSchema, await request.json().catch(() => ({})))
    return apiSuccess(await createCustomDefinition({ officeId: user.officeId, actorUserId: user.id, requestId: user.requestId, value }), 201)
  })
}
