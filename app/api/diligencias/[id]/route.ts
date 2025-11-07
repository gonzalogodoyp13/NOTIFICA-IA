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
    const existingDiligencia = await prisma.diligenciaTipos.findFirst({
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

    const diligencia = await prisma.diligenciaTipos.update({
      where: { id },
      data: parsed.data,
    })

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Actualizó Tipo de Diligencia: ${diligencia.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, data: diligencia })
  } catch (error: any) {
    console.error('Error updating diligencia:', error)
    const errorMessage = error?.message || 'Error al actualizar el tipo de diligencia'
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

    // Verify diligencia exists and belongs to user's office
    const existingDiligencia = await prisma.diligenciaTipos.findFirst({
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

    await prisma.diligenciaTipos.delete({
      where: { id },
    })

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Eliminó Tipo de Diligencia: ${existingDiligencia.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, message: 'Tipo de diligencia eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting diligencia:', error)
    const errorMessage = error?.message || 'Error al eliminar el tipo de diligencia'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

