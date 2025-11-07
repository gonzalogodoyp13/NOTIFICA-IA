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

    // Verify banco exists and belongs to user's office
    const existingBanco = await prisma.banco.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingBanco) {
      return NextResponse.json(
        { ok: false, error: 'Banco no encontrado' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = BancoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const banco = await prisma.banco.update({
      where: { id },
      data: parsed.data,
    })

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Actualizó Banco: ${banco.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, data: banco })
  } catch (error: any) {
    console.error('Error updating banco:', error)
    const errorMessage = error?.message || 'Error al actualizar el banco'
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

    // Verify banco exists and belongs to user's office
    const existingBanco = await prisma.banco.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingBanco) {
      return NextResponse.json(
        { ok: false, error: 'Banco no encontrado' },
        { status: 404 }
      )
    }

    await prisma.banco.delete({
      where: { id },
    })

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Eliminó Banco: ${existingBanco.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, message: 'Banco eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting banco:', error)
    const errorMessage = error?.message || 'Error al eliminar el banco'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

