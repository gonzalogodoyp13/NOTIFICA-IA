// API route: /api/procuradores/[id]/link-banco
// POST: Link existing procurador to a banco
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { LinkBancoSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, message: 'ID inválido', error: 'ID inválido' },
        { status: 400 }
      )
    }

    // Verify procurador exists and belongs to office
    const procurador = await prisma.procurador.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!procurador) {
      return NextResponse.json(
        { ok: false, message: 'Procurador no encontrado o no pertenece a tu oficina', error: 'Procurador no encontrado' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = LinkBancoSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    // Verify banco exists and belongs to office
    const banco = await prisma.banco.findFirst({
      where: {
        id: parsed.data.bancoId,
        officeId: user.officeId,
      },
    })

    if (!banco) {
      return NextResponse.json(
        { ok: false, message: 'Banco no encontrado o no pertenece a tu oficina', error: 'Banco no encontrado' },
        { status: 404 }
      )
    }

    // Check if link already exists
    const existing = await prisma.bancoProcurador.findFirst({
      where: {
        officeId: user.officeId,
        bancoId: parsed.data.bancoId,
        procuradorId: id,
      },
    })

    if (existing) {
      return NextResponse.json(
        { ok: false, message: 'Este procurador ya está vinculado a este banco', error: 'Ya está vinculado', errorCode: 'DUPLICATE' },
        { status: 409 }
      )
    }

    // Create link
    try {
      const bancoProcurador = await prisma.bancoProcurador.create({
        data: {
          officeId: user.officeId,
          bancoId: parsed.data.bancoId,
          procuradorId: id,
          alias: parsed.data.alias?.trim() || null,
          activo: true,
        },
      })

      return NextResponse.json({
        ok: true,
        data: {
          bancoProcurador,
        },
      })
    } catch (error: any) {
      if (error.code === 'P2002') {
        return NextResponse.json(
          { ok: false, message: 'Este procurador ya está vinculado a este banco', error: 'Ya está vinculado', errorCode: 'DUPLICATE' },
          { status: 409 }
        )
      }
      throw error
    }
  } catch (error) {
    console.error('Error linking procurador to banco:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al vincular el procurador'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

