// API route: /api/tribunales/[id]
// PUT: Update a tribunal
// DELETE: Delete a tribunal
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { TribunalSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

export async function PUT(
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

    // Convert params.id to number for Phase 3 tribunales (Int ID)
    const id = Number(params.id)
    
    if (isNaN(id) || !Number.isInteger(id)) {
      return NextResponse.json(
        { ok: false, message: 'ID inválido', error: 'ID debe ser un número entero válido' },
        { status: 400 }
      )
    }

    // Verify tribunal exists and belongs to user's office (Phase 3: tribunales table with Int ID)
    const existingTribunal = await prisma.tribunales.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingTribunal) {
      return NextResponse.json(
        { ok: false, message: 'Tribunal no encontrado o no pertenece a tu oficina', error: 'Tribunal no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = TribunalSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const tribunal = await prisma.tribunales.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json({ ok: true, data: tribunal })
  } catch (error) {
    console.error('Error updating tribunal:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar el tribunal'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    // Convert params.id to number for Phase 3 tribunales (Int ID)
    const id = Number(params.id)
    
    if (isNaN(id) || !Number.isInteger(id)) {
      return NextResponse.json(
        { ok: false, message: 'ID inválido', error: 'ID debe ser un número entero válido' },
        { status: 400 }
      )
    }

    // Verify tribunal exists and belongs to user's office (Phase 3: tribunales table with Int ID)
    const existingTribunal = await prisma.tribunales.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingTribunal) {
      return NextResponse.json(
        { ok: false, message: 'Tribunal no encontrado o no pertenece a tu oficina', error: 'Tribunal no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    await prisma.tribunales.delete({
      where: { id },
    })

    return NextResponse.json({ ok: true, message: 'Tribunal eliminado correctamente' })
  } catch (error) {
    console.error('Error deleting tribunal:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al eliminar el tribunal'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

