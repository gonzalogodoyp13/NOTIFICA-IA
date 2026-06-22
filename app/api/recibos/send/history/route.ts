import { NextRequest } from 'next/server'

import { apiSuccess, withApiUser } from '@/lib/api/server'
import { listRecibosDispatchHistory } from '@/lib/recibos/dispatch-history'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'list receipt send history', async user => {
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? 20)
    const stateValue = req.nextUrl.searchParams.get('state')
    const state = z.enum(['sent', 'failed', 'waiting', 'overdue', 'replied', 'resolved']).optional().parse(stateValue || undefined)
    return apiSuccess(await listRecibosDispatchHistory(user.officeId, limit, state))
  })
}
