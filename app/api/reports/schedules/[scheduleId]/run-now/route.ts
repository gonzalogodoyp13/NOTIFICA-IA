import { NextRequest } from 'next/server'

import { apiSuccess, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { validateReportIdempotencyKey } from '@/lib/reports/deliveryAttempts'
import { serializeReportJob } from '@/lib/reports/jobs'
import { runScheduleNow } from '@/lib/reports/schedules'

export async function POST(request: NextRequest, { params }: { params: { scheduleId: string } }) {
  return withApiUser(request, 'reports.schedules.run_now', async user => {
    assertReportAdmin(user)
    const idempotencyKey = validateReportIdempotencyKey(request.headers.get('Idempotency-Key'))
    const job = await runScheduleNow({ officeId: user.officeId, scheduleId: params.scheduleId, actorUserId: user.id, idempotencyKey, requestId: user.requestId })
    return apiSuccess(serializeReportJob(job), 202)
  })
}
