import { withApiUser } from '@/lib/api/server'
// API route: /api/diligencia-tipos/[id]
// PUT: Update a diligencia tipo
// DELETE: Delete a diligencia tipo
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DiligenciaTipoSchema } from '@/lib/zodSchemas'
import { recordSettingsEvent } from '@/lib/audit/businessEvents'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return withApiUser(req, 'put.diligencia-tipos.id', async user => {
  try {

    const id = params.id

    // Verify diligencia exists and belongs to user's office
    const existingDiligencia = await prisma.diligenciaTipo.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingDiligencia) {
      return NextResponse.json(
        { ok: false, message: 'Tipo de diligencia no encontrado o no pertenece a tu oficina', error: 'Tipo de diligencia no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = DiligenciaTipoSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const diligencia = await prisma.$transaction(async tx => {
      const updated = await tx.diligenciaTipo.update({ where: { id }, data: parsed.data })
      await recordSettingsEvent(tx, user, { resource: 'DiligenciaTipo', action: 'updated', recordId: id, changedFields: Object.keys(parsed.data) })
      return updated
    })

    return NextResponse.json({ ok: true, data: diligencia })
  } catch (error) {
    console.error('API operation failed')
    const errorMessage = 'Error al actualizar el tipo de diligencia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }

  })
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return withApiUser(req, 'delete.diligencia-tipos.id', async user => {
  try {

    const id = params.id

    // Verify diligencia exists and belongs to user's office
    const existingDiligencia = await prisma.diligenciaTipo.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingDiligencia) {
      return NextResponse.json(
        { ok: false, message: 'Tipo de diligencia no encontrado o no pertenece a tu oficina', error: 'Tipo de diligencia no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    await prisma.$transaction(async tx => {
      await tx.diligenciaTipo.delete({ where: { id } })
      await recordSettingsEvent(tx, user, { resource: 'DiligenciaTipo', action: 'deleted', recordId: id })
    })

    return NextResponse.json({ ok: true, message: 'Tipo de diligencia eliminado correctamente' })
  } catch (error) {
    console.error('API operation failed')
    const errorMessage = 'Error al eliminar el tipo de diligencia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }

  })
}

