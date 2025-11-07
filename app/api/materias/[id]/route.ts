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
    const existingMateria = await prisma.materias.findFirst({
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

    const materia = await prisma.materias.update({
      where: { id },
      data: parsed.data,
    })

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Actualizó Materia: ${materia.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, data: materia })
  } catch (error: any) {
    console.error('Error updating materia:', error)
    const errorMessage = error?.message || 'Error al actualizar la materia'
    return NextResponse.json(
      { ok: false, error: errorMessage },
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
    const existingMateria = await prisma.materias.findFirst({
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

    await prisma.materias.delete({
      where: { id },
    })

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Eliminó Materia: ${existingMateria.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, message: 'Materia eliminada correctamente' })
  } catch (error: any) {
    console.error('Error deleting materia:', error)
    const errorMessage = error?.message || 'Error al eliminar la materia'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

