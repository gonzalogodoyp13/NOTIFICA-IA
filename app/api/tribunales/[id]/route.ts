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

    const id = params.id

    // Verify tribunal exists and belongs to user's office
    const existingTribunal = await prisma.tribunal.findFirst({
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

    const tribunal = await prisma.tribunal.update({
      where: { id },
      data: parsed.data,
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Actualizó Tribunal: ${tribunal.nombre}`,
      },
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

    const id = params.id

    // Verify tribunal exists and belongs to user's office
    const existingTribunal = await prisma.tribunal.findFirst({
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

    await prisma.tribunal.delete({
      where: { id },
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Eliminó Tribunal: ${existingTribunal.nombre}`,
      },
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

