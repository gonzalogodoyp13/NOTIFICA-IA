// API route: /api/diligencias/[id]
// PUT: Update a diligencia tipo
// DELETE: Delete a diligencia tipo
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { DiligenciaTipoSchema } from '@/lib/zodSchemas'

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

    // Verify diligencia exists and belongs to user's office
    const existingDiligencia = await prisma.diligenciaTipo.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingDiligencia) {
      return NextResponse.json(
        { ok: false, error: 'Tipo de diligencia no encontrado' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = DiligenciaTipoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const diligencia = await prisma.diligenciaTipo.update({
      where: { id },
      data: parsed.data,
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Actualizó Tipo de Diligencia: ${diligencia.nombre}`,
      },
    })

    return NextResponse.json({ ok: true, data: diligencia })
  } catch (error) {
    console.error('Error updating diligencia:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al actualizar el tipo de diligencia' },
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

    // Verify diligencia exists and belongs to user's office
    const existingDiligencia = await prisma.diligenciaTipo.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingDiligencia) {
      return NextResponse.json(
        { ok: false, error: 'Tipo de diligencia no encontrado' },
        { status: 404 }
      )
    }

    await prisma.diligenciaTipo.delete({
      where: { id },
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Eliminó Tipo de Diligencia: ${existingDiligencia.nombre}`,
      },
    })

    return NextResponse.json({ ok: true, message: 'Tipo de diligencia eliminado correctamente' })
  } catch (error) {
    console.error('Error deleting diligencia:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al eliminar el tipo de diligencia' },
      { status: 500 }
    )
  }
}

