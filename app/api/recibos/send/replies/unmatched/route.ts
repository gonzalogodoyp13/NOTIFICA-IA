import { NextRequest } from 'next/server'

import { apiSuccess, withApiUser } from '@/lib/api/server'
import { listUnmatchedReplies } from '@/lib/recibos/reply-sync'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'list unmatched receipt replies', async user => {
    const limit = Number(req.nextUrl.searchParams.get('limit') ?? 25)
    return apiSuccess(await listUnmatchedReplies(user.officeId, limit))
  })
}
