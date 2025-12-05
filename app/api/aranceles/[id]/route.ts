// API route: /api/aranceles/[id]
// GET: Get a specific arancel
// PUT: Update an arancel
// DELETE: Delete an arancel
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ArancelSchema, parseArancelMonto } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

export async function GET(
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

    const arancel = await prisma.arancel.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
      include: {
        estampo: {
          select: { id: true, nombre: true, tipo: true, activo: true },
        },
        banco: {
          select: { id: true, nombre: true },
        },
        abogado: {
          select: { id: true, nombre: true },
        },
      },
    })

    if (!arancel) {
      return NextResponse.json(
        { ok: false, message: 'Arancel no encontrado', error: 'Arancel no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: arancel })
  } catch (error) {
    console.error('Error fetching arancel:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener el arancel'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

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

    // Verificar que arancel existe y pertenece a officeId
    const existingArancel = await prisma.arancel.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingArancel) {
      return NextResponse.json(
        { ok: false, message: 'Arancel no encontrado o no pertenece a tu oficina', error: 'Arancel no encontrado' },
        { status: 404 }
      )
    }

    const body = await req.json()

    // Construir objeto de actualización solo con campos permitidos
    const updateData: any = {}

    // NO permitir cambiar bancoId o abogadoId
    if (body.bancoId !== undefined || body.abogadoId !== undefined) {
      return NextResponse.json(
        { ok: false, message: 'No se puede cambiar bancoId o abogadoId. Elimina y crea un nuevo arancel.', error: 'Campos no modificables' },
        { status: 400 }
      )
    }

    // Parsear monto si se proporciona
    if (body.monto !== undefined) {
      let montoParsed: number
      if (typeof body.monto === 'string') {
        montoParsed = parseArancelMonto(body.monto)
      } else {
        montoParsed = Math.floor(body.monto || 0)
      }
      updateData.monto = montoParsed
    }

    // Validar estampoId si se cambia
    if (body.estampoId !== undefined) {
      const estampo = await prisma.estampo.findFirst({
        where: {
          id: body.estampoId,
          officeId: user.officeId,
          activo: true,
        },
      })

      if (!estampo) {
        return NextResponse.json(
          { ok: false, message: 'Estampo no encontrado o está inactivo', error: 'Estampo no encontrado o inactivo' },
          { status: 400 }
        )
      }

      // Verificar unicidad con nuevo estampoId
      const existingWithNewEstampo = await prisma.arancel.findFirst({
        where: {
          officeId: user.officeId,
          bancoId: existingArancel.bancoId,
          abogadoId: existingArancel.abogadoId,
          estampoId: body.estampoId,
          id: { not: id }, // Excluir el arancel actual
        },
      })

      if (existingWithNewEstampo) {
        return NextResponse.json(
          { ok: false, message: 'Ya existe un arancel para esta combinación con el nuevo estampo', error: 'Duplicado' },
          { status: 400 }
        )
      }

      updateData.estampoId = body.estampoId
    }

    // Actualizar activo si se proporciona
    if (body.activo !== undefined) {
      updateData.activo = body.activo
    }

    // Si no hay nada que actualizar
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, message: 'No se proporcionaron campos para actualizar', error: 'Sin cambios' },
        { status: 400 }
      )
    }

    // Actualizar arancel
    try {
      const arancel = await prisma.arancel.update({
        where: { id },
        data: updateData,
        include: {
          estampo: {
            select: { id: true, nombre: true, tipo: true },
          },
          abogado: existingArancel.abogadoId
            ? {
                select: { id: true, nombre: true },
              }
            : false,
        },
      })

      return NextResponse.json({ ok: true, data: arancel })
    } catch (error: any) {
      // Capturar error de constraint violation
      if (error.code === 'P2002') {
        return NextResponse.json(
          {
            ok: false,
            message: 'Ya existe un arancel para esta combinación',
            error: 'Duplicado',
          },
          { status: 400 }
        )
      }
      throw error
    }
  } catch (error) {
    console.error('Error updating arancel:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar el arancel'
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

    // Verificar que arancel existe y pertenece a officeId
    const existingArancel = await prisma.arancel.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingArancel) {
      return NextResponse.json(
        { ok: false, message: 'Arancel no encontrado o no pertenece a tu oficina', error: 'Arancel no encontrado' },
        { status: 404 }
      )
    }

    // Hard delete
    await prisma.arancel.delete({
      where: { id },
    })

    return NextResponse.json({ ok: true, message: 'Arancel eliminado correctamente' })
  } catch (error) {
    console.error('Error deleting arancel:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al eliminar el arancel'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

