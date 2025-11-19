// API route: /api/materias/[id]
// PUT: Update a materia
// DELETE: Delete a materia
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { MateriaSchema } from '@/lib/zodSchemas'

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

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, message: 'ID inválido', error: 'ID inválido' },
        { status: 400 }
      )
    }

    // Verify materia exists and belongs to user's office
    const existingMateria = await prisma.materia.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingMateria) {
      return NextResponse.json(
        { ok: false, message: 'Materia no encontrada o no pertenece a tu oficina', error: 'Materia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = MateriaSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const materia = await prisma.materia.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json({ ok: true, data: materia })
  } catch (error) {
    console.error('Error updating materia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar la materia'
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

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, message: 'ID inválido', error: 'ID inválido' },
        { status: 400 }
      )
    }

    // Verify materia exists and belongs to user's office
    const existingMateria = await prisma.materia.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingMateria) {
      return NextResponse.json(
        { ok: false, message: 'Materia no encontrada o no pertenece a tu oficina', error: 'Materia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    await prisma.materia.delete({
      where: { id },
    })

    return NextResponse.json({ ok: true, message: 'Materia eliminada correctamente' })
  } catch (error) {
    console.error('Error deleting materia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al eliminar la materia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

