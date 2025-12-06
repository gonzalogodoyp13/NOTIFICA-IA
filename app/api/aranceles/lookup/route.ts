import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { lookupArancel } from '@/lib/utils/aranceles'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const bancoIdParam = searchParams.get('bancoId')
    const abogadoIdParam = searchParams.get('abogadoId')
    const estampoId = searchParams.get('estampoId')

    if (!bancoIdParam || !estampoId) {
      return NextResponse.json(
        { ok: false, message: 'bancoId y estampoId son requeridos', error: 'Parámetros inválidos' },
        { status: 400 }
      )
    }

    const bancoId = parseInt(bancoIdParam, 10)
    const abogadoId = abogadoIdParam ? parseInt(abogadoIdParam, 10) : null

    if (isNaN(bancoId)) {
      return NextResponse.json(
        { ok: false, message: 'bancoId inválido', error: 'Parámetros inválidos' },
        { status: 400 }
      )
    }

    const arancel = await lookupArancel(user.officeId, bancoId, abogadoId, estampoId)

    if (!arancel) {
      return NextResponse.json({ ok: true, data: null })
    }

    return NextResponse.json({ ok: true, data: arancel })
  } catch (error) {
    console.error('Error en lookup de arancel:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al buscar arancel'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

