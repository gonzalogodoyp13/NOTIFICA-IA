import { NextRequest, NextResponse } from 'next/server'
import { withApiUser } from '@/lib/api/server'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'procurador.bank.link.retired', async () => NextResponse.json(
    {
      ok: false,
      message: 'Esta operacion fue retirada. Los bancos de un procurador ahora se derivan desde sus abogados asignados.',
      error: 'Operacion retirada',
    },
    { status: 410 }
  ))
}
