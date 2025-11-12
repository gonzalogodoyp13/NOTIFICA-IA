// API route: /api/bancos/[id]
// PUT: Update a banco
// DELETE: Delete a banco
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { BancoSchema } from '@/lib/zodSchemas'

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

    // Verify banco exists and belongs to user's office
    const existingBanco = await prisma.banco.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingBanco) {
      return NextResponse.json(
        { ok: false, message: 'Banco no encontrado o no pertenece a tu oficina', error: 'Banco no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = BancoSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const banco = await prisma.banco.update({
      where: { id },
      data: parsed.data,
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Actualizó Banco: ${banco.nombre}`,
      },
    })

    return NextResponse.json({ ok: true, data: banco })
  } catch (error) {
    console.error('Error updating banco:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar el banco'
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

    // Verify banco exists and belongs to user's office
    const existingBanco = await prisma.banco.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingBanco) {
      return NextResponse.json(
        { ok: false, message: 'Banco no encontrado o no pertenece a tu oficina', error: 'Banco no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    await prisma.banco.delete({
      where: { id },
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Eliminó Banco: ${existingBanco.nombre}`,
      },
    })

    return NextResponse.json({ ok: true, message: 'Banco eliminado correctamente' })
  } catch (error) {
    console.error('Error deleting banco:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al eliminar el banco'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

