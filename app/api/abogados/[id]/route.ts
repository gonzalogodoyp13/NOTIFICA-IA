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

    // Verify abogado exists and belongs to user's office
    const existingAbogado = await prisma.abogado.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingAbogado) {
      return NextResponse.json(
        { ok: false, error: 'Abogado no encontrado' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = AbogadoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
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
          { ok: false, error: 'Banco no encontrado o no pertenece a tu oficina' },
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

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Actualizó Abogado: ${abogado.nombre || 'Sin nombre'}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, data: abogado })
  } catch (error: any) {
    console.error('Error updating abogado:', error)
    const errorMessage = error?.message || 'Error al actualizar el abogado'
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

    // Verify abogado exists and belongs to user's office
    const existingAbogado = await prisma.abogado.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingAbogado) {
      return NextResponse.json(
        { ok: false, error: 'Abogado no encontrado' },
        { status: 404 }
      )
    }

    await prisma.abogado.delete({
      where: { id },
    })

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Eliminó Abogado: ${existingAbogado.nombre || 'Sin nombre'}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, message: 'Abogado eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting abogado:', error)
    const errorMessage = error?.message || 'Error al eliminar el abogado'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

