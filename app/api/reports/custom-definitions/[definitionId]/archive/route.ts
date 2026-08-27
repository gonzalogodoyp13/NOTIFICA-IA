import { NextRequest } from 'next/server'

import { apiSuccess, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { archiveCustomDefinition } from '@/lib/reports/customReports'

export async function POST(request: NextRequest, { params }: { params: { definitionId: string } }) {
  return withApiUser(request, 'reports.custom_definitions.archive', async user => {
    assertReportAdmin(user)
    return apiSuccess(await archiveCustomDefinition({ officeId: user.officeId, definitionId: params.definitionId, actorUserId: user.id, requestId: user.requestId }))
  })
}
