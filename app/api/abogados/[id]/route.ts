// API route: /api/abogados/[id]
// PUT: Update an abogado
// DELETE: Delete an abogado
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { AbogadoSchema } from '@/lib/zodSchemas'

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

    // Verify abogado exists and belongs to user's office
    const existingAbogado = await prisma.abogado.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingAbogado) {
      return NextResponse.json(
        { ok: false, message: 'Abogado no encontrado o no pertenece a tu oficina', error: 'Abogado no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = AbogadoSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    // Verify bancoId belongs to user's office if provided
    if (parsed.data.bancoId) {
      const banco = await prisma.banco.findFirst({
        where: {
          id: parsed.data.bancoId,
          officeId: user.officeId,
        },
      })

      if (!banco) {
        return NextResponse.json(
          { ok: false, message: 'Banco no encontrado o no pertenece a tu oficina', error: 'Banco no encontrado o no pertenece a tu oficina' },
          { status: 400 }
        )
      }
    }

    const abogado = await prisma.abogado.update({
      where: { id },
      data: parsed.data,
      include: {
        banco: {
          select: {
            nombre: true,
          },
        },
      },
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Actualizó Abogado: ${abogado.nombre || 'Sin nombre'}`,
      },
    })

    return NextResponse.json({ ok: true, data: abogado })
  } catch (error) {
    console.error('Error updating abogado:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar el abogado'
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

    // Verify abogado exists and belongs to user's office
    const existingAbogado = await prisma.abogado.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingAbogado) {
      return NextResponse.json(
        { ok: false, message: 'Abogado no encontrado o no pertenece a tu oficina', error: 'Abogado no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    await prisma.abogado.delete({
      where: { id },
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Eliminó Abogado: ${existingAbogado.nombre || 'Sin nombre'}`,
      },
    })

    return NextResponse.json({ ok: true, message: 'Abogado eliminado correctamente' })
  } catch (error) {
    console.error('Error deleting abogado:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al eliminar el abogado'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

