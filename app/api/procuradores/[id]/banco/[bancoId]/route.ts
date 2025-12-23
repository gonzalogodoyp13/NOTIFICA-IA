// API route: /api/procuradores/[id]/banco/[bancoId]
// DELETE: Unlink procurador from banco (delete join row)
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; bancoId: string } }
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
    const bancoId = parseInt(params.bancoId)

    if (isNaN(id) || isNaN(bancoId)) {
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

    // Verify banco exists and belongs to office
    const banco = await prisma.banco.findFirst({
      where: {
        id: bancoId,
        officeId: user.officeId,
      },
    })

    if (!banco) {
      return NextResponse.json(
        { ok: false, message: 'Banco no encontrado o no pertenece a tu oficina', error: 'Banco no encontrado' },
        { status: 404 }
      )
    }

    // Find banco-procurador link
    const bancoProcurador = await prisma.bancoProcurador.findFirst({
      where: {
        officeId: user.officeId,
        bancoId,
        procuradorId: id,
      },
    })

    if (!bancoProcurador) {
      return NextResponse.json(
        { ok: false, message: 'Relación no encontrada', error: 'Relación no encontrada' },
        { status: 404 }
      )
    }

    // Delete link
    await prisma.bancoProcurador.delete({
      where: { id: bancoProcurador.id },
    })

    return NextResponse.json({
      ok: true,
      message: 'Desvinculado correctamente',
    })
  } catch (error) {
    console.error('Error unlinking procurador from banco:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al desvincular el procurador'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

