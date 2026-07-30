import { NextRequest, NextResponse } from 'next/server'

import { withApiUser } from '@/lib/api/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'user.me', async context => NextResponse.json({
    id: context.id,
    email: context.email,
    officeId: context.officeId,
    isOfficeAdmin: context.isOfficeAdmin,
  }))
}
