import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json(
    {
      ok: false,
      message: 'Esta operacion fue retirada. Los bancos de un procurador ahora se derivan desde sus abogados asignados.',
      error: 'Operacion retirada',
    },
    { status: 410 }
  )
}
