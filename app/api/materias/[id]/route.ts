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
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, error: 'ID inválido' },
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
        { ok: false, error: 'Materia no encontrada' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = MateriaSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const materia = await prisma.materia.update({
      where: { id },
      data: parsed.data,
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Actualizó Materia: ${materia.nombre}`,
      },
    })

    return NextResponse.json({ ok: true, data: materia })
  } catch (error) {
    console.error('Error updating materia:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al actualizar la materia' },
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
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, error: 'ID inválido' },
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
        { ok: false, error: 'Materia no encontrada' },
        { status: 404 }
      )
    }

    await prisma.materia.delete({
      where: { id },
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Eliminó Materia: ${existingMateria.nombre}`,
      },
    })

    return NextResponse.json({ ok: true, message: 'Materia eliminada correctamente' })
  } catch (error) {
    console.error('Error deleting materia:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al eliminar la materia' },
      { status: 500 }
    )
  }
}

