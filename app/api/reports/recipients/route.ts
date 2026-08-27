import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { getRecipientConfiguration, RecipientConfigUpdateSchema, updateRecipientConfiguration } from '@/lib/reports/recipients'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return withApiUser(request, 'reports.recipients.list', async user => {
    assertReportAdmin(user)
    return apiSuccess(await getRecipientConfiguration(user.officeId))
  })
}

export async function PUT(request: NextRequest) {
  return withApiUser(request, 'reports.recipients.update', async user => {
    assertReportAdmin(user)
    const input = parseApiInput(RecipientConfigUpdateSchema, await request.json().catch(() => ({})))
    return apiSuccess(await updateRecipientConfiguration({ officeId: user.officeId, actorUserId: user.id, requestId: user.requestId, ...input }))
  })
}
