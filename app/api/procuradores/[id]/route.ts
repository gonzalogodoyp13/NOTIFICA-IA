// API route: /api/procuradores/[id]
// GET: Get a single procurador
// PATCH: Update a procurador
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ProcuradorUpdateSchema } from '@/lib/zodSchemas'

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

    // Verify procurador exists and belongs to office
    const procurador = await prisma.procurador.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
      include: {
        abogado: {
          select: {
            id: true,
            nombre: true,
          },
        },
        bancos: {
          select: {
            bancoId: true,
            activo: true,
          },
        },
      },
    })

    if (!procurador) {
      return NextResponse.json(
        { ok: false, message: 'Procurador no encontrado o no pertenece a tu oficina', error: 'Procurador no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: procurador })
  } catch (error) {
    console.error('Error fetching procurador:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener el procurador'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function PATCH(
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

    // Verify procurador exists and belongs to office
    const existingProcurador = await prisma.procurador.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingProcurador) {
      return NextResponse.json(
        { ok: false, message: 'Procurador no encontrado o no pertenece a tu oficina', error: 'Procurador no encontrado' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = ProcuradorUpdateSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    // Normalize optional fields: "" -> null, undefined -> null, null stays null
    const updateData: any = {}
    if (parsed.data.nombre !== undefined) updateData.nombre = parsed.data.nombre
    if (parsed.data.email !== undefined) {
      updateData.email = parsed.data.email?.trim() || null
    }
    if (parsed.data.telefono !== undefined) {
      updateData.telefono = parsed.data.telefono?.trim() || null
    }
    if (parsed.data.notas !== undefined) {
      updateData.notas = parsed.data.notas?.trim() || null
    }

    // Validate abogadoId if provided
    if (parsed.data.abogadoId !== undefined) {
      if (parsed.data.abogadoId !== null) {
        const abogado = await prisma.abogado.findFirst({
          where: {
            id: parsed.data.abogadoId,
            officeId: user.officeId,
          },
        })

        if (!abogado) {
          return NextResponse.json(
            { ok: false, message: 'Abogado no encontrado o no pertenece a tu oficina', error: 'Abogado no encontrado' },
            { status: 404 }
          )
        }
      }
      updateData.abogadoId = parsed.data.abogadoId
    }

    // Update procurador
    const procurador = await prisma.procurador.update({
      where: { id },
      data: updateData,
      include: {
        abogado: {
          select: {
            id: true,
            nombre: true,
          },
        },
        bancos: {
          select: {
            activo: true,
            alias: true,
            bancoId: true,
          },
        },
      },
    })

    return NextResponse.json({ ok: true, data: procurador })
  } catch (error) {
    console.error('Error updating procurador:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar el procurador'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

