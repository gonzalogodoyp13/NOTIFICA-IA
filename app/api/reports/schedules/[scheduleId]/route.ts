import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { ScheduleUpdateSchema, updateReportSchedule } from '@/lib/reports/schedules'

export async function PATCH(request: NextRequest, { params }: { params: { scheduleId: string } }) {
  return withApiUser(request, 'reports.schedules.update', async user => {
    assertReportAdmin(user)
    const value = parseApiInput(ScheduleUpdateSchema, await request.json().catch(() => ({})))
    return apiSuccess(await updateReportSchedule({ officeId: user.officeId, scheduleId: params.scheduleId, actorUserId: user.id, requestId: user.requestId, value }))
  })
}
