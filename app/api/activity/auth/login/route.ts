import { NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { recordActivityEvent } from '@/lib/audit/activityEvent'

export const dynamic = 'force-dynamic'

export async function POST() {
  const user = await getCurrentUserWithOffice()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  await recordActivityEvent({
    userId: user.id,
    officeId: user.officeId,
    eventType: 'auth.login',
    module: 'auth',
    result: 'success',
    recordType: 'user',
    recordId: user.id,
    shortName: user.email,
    description: 'Inicio de sesion exitoso.',
  })

  return NextResponse.json({ ok: true })
}
