// API route: /api/comunas/[id]
// PUT: Update a comuna
// DELETE: Delete a comuna
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ComunaSchema } from '@/lib/zodSchemas'

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

    // Verify comuna exists and belongs to user's office
    const existingComuna = await prisma.comuna.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingComuna) {
      return NextResponse.json(
        { ok: false, message: 'Comuna no encontrada o no pertenece a tu oficina', error: 'Comuna no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = ComunaSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const comuna = await prisma.comuna.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json({ ok: true, data: comuna })
  } catch (error) {
    console.error('Error updating comuna:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar la comuna'
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

    // Verify comuna exists and belongs to user's office
    const existingComuna = await prisma.comuna.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingComuna) {
      return NextResponse.json(
        { ok: false, message: 'Comuna no encontrada o no pertenece a tu oficina', error: 'Comuna no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    await prisma.comuna.delete({
      where: { id },
    })

    return NextResponse.json({ ok: true, message: 'Comuna eliminada correctamente' })
  } catch (error) {
    console.error('Error deleting comuna:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al eliminar la comuna'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

