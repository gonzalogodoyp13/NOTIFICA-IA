import { NextRequest } from 'next/server'

import { apiSuccess, withApiUser } from '@/lib/api/server'
import { syncOfficeReplies } from '@/lib/recibos/reply-sync'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return withApiUser(req, 'sync receipt replies', async user => {
    return apiSuccess(await syncOfficeReplies({ officeId: user.officeId, userId: user.id, requestId: user.requestId }))
  })
}
