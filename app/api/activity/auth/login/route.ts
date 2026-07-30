import { NextRequest, NextResponse } from 'next/server'

import { withApiUser } from '@/lib/api/server'
import { recordBestEffortEvent } from '@/lib/audit/activityEvent'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return withApiUser(req, 'auth.login', async context => {
    await recordBestEffortEvent(context, {
      eventType: 'auth.login',
      module: 'auth',
      result: 'success',
      recordType: 'user',
      recordId: context.id,
      description: 'Inicio de sesion exitoso.',
    })
    return NextResponse.json({ ok: true })
  })
}
