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

    // Verify tribunal exists and belongs to user's office
    const existingTribunal = await prisma.tribunal.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingTribunal) {
      return NextResponse.json(
        { ok: false, error: 'Tribunal no encontrado' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = TribunalSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const tribunal = await prisma.tribunal.update({
      where: { id },
      data: parsed.data,
    })

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Actualizó Tribunal: ${tribunal.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, data: tribunal })
  } catch (error: any) {
    console.error('Error updating tribunal:', error)
    const errorMessage = error?.message || 'Error al actualizar el tribunal'
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

    // Verify tribunal exists and belongs to user's office
    const existingTribunal = await prisma.tribunal.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingTribunal) {
      return NextResponse.json(
        { ok: false, error: 'Tribunal no encontrado' },
        { status: 404 }
      )
    }

    await prisma.tribunal.delete({
      where: { id },
    })

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Eliminó Tribunal: ${existingTribunal.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, message: 'Tribunal eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting tribunal:', error)
    const errorMessage = error?.message || 'Error al eliminar el tribunal'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

