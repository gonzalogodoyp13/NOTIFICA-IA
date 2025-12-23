// API route: /api/procuradores/[id]/banco/[bancoId]/toggle-activo
// PATCH: Toggle or set activo (per-banco) for a procurador-banco link
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ToggleActivoSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

export async function PATCH(
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

    // Parse body (optional)
    let body: { activo?: boolean } = {}
    try {
      body = await req.json()
    } catch {
      // Body is optional, continue with toggle
    }

    const parsed = ToggleActivoSchema.safeParse(body)

    // Determine new activo value: if body has activo, use it; otherwise toggle
    const nuevoActivo = parsed.success && parsed.data.activo !== undefined
      ? parsed.data.activo
      : !bancoProcurador.activo

    // Update
    await prisma.bancoProcurador.update({
      where: { id: bancoProcurador.id },
      data: { activo: nuevoActivo },
    })

    return NextResponse.json({
      ok: true,
      data: {
        activo: nuevoActivo,
      },
    })
  } catch (error) {
    console.error('Error toggling activo per-banco:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al cambiar estado activo'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

