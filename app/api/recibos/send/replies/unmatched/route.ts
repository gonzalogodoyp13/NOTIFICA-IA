import { NextRequest } from 'next/server'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { listUnmatchedReplies } from '@/lib/recibos/reply-sync'
import { UnmatchedReplyQuerySchema } from '@/lib/recibos/unmatched-replies-core'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'list unmatched receipt replies', async user => {
    const query = parseApiInput(UnmatchedReplyQuerySchema, Object.fromEntries(req.nextUrl.searchParams))
    return apiSuccess(await listUnmatchedReplies({ officeId: user.officeId, ...query }))
  })
}
