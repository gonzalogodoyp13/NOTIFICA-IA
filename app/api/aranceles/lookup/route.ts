import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { lookupArancel, lookupArancelByCategoria } from '@/lib/utils/aranceles'

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
    const categoria = searchParams.get('categoria')

    if (!bancoIdParam) {
      return NextResponse.json(
        { ok: false, message: 'bancoId es requerido', error: 'Parámetros inválidos' },
        { status: 400 }
      )
    }

    // Validar: si ambos están presentes, es un error del cliente
    if (estampoId && categoria) {
      return NextResponse.json(
        { ok: false, message: 'No puede proporcionar ambos estampoId y categoria', error: 'Parámetros inválidos' },
        { status: 400 }
      )
    }

    // Si ninguno está presente, retornar null (no error) - permite transiciones suaves en UI
    if (!estampoId && !categoria) {
      return NextResponse.json({ ok: true, data: null })
    }

    const bancoId = parseInt(bancoIdParam, 10)
    const abogadoId = abogadoIdParam ? parseInt(abogadoIdParam, 10) : null

    if (isNaN(bancoId)) {
      return NextResponse.json(
        { ok: false, message: 'bancoId inválido', error: 'Parámetros inválidos' },
        { status: 400 }
      )
    }

    let arancel = null

    // LEGACY path (sin cambios en lógica)
    if (estampoId) {
      arancel = await lookupArancel(user.officeId, bancoId, abogadoId, estampoId)
    }
    // WIZARD path (nuevo)
    else if (categoria) {
      arancel = await lookupArancelByCategoria(user.officeId, bancoId, abogadoId, categoria)
    }

    return NextResponse.json(arancel ? { ok: true, data: arancel } : { ok: true, data: null })
  } catch (error) {
    console.error('Error en lookup de arancel:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al buscar arancel'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

