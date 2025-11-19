// API route: /api/diligencias
// GET: List all diligencias for given rolId (ROL Phase 4)
// POST: Create new Diligencia (validates with zDiligencia)
// PUT: Update estado or meta
// DELETE: Remove if role = "Receptor"
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { zDiligencia, zDiligenciaUpdate } from '@/lib/validations/diligencia'
import { ZodError } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const rolId = searchParams.get('rolId')

    if (!rolId) {
      return NextResponse.json(
        { ok: false, message: 'rolId es requerido', error: 'rolId es requerido' },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    // Verify rol belongs to user's office
    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: rolId,
        officeId: officeIdStr,
      },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, message: 'Rol no encontrado o no pertenece a tu oficina', error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Fetch diligencias for this rol
    const diligencias = await prisma.diligencia.findMany({
      where: {
        rolId,
      },
      include: {
        tipo: {
          select: {
            nombre: true,
            descripcion: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ ok: true, data: diligencias })
  } catch (error) {
    console.error('Error fetching diligencias:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener las diligencias'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const parsed = zDiligencia.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    // Verify rol belongs to user's office
    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: parsed.data.rolId,
        officeId: officeIdStr,
      },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, message: 'Rol no encontrado o no pertenece a tu oficina', error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Verify tipo belongs to user's office
    const tipo = await prisma.diligenciaTipo.findFirst({
      where: {
        id: parsed.data.tipoId,
        officeId: officeIdStr,
      },
    })

    if (!tipo) {
      return NextResponse.json(
        { ok: false, message: 'Tipo de diligencia no encontrado o no pertenece a tu oficina', error: 'Tipo de diligencia no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Create Diligencia
    const diligencia = await prisma.diligencia.create({
      data: {
        rolId: parsed.data.rolId,
        tipoId: parsed.data.tipoId,
        fecha: parsed.data.fecha,
        estado: parsed.data.estado,
        meta: parsed.data.meta || null,
      },
      include: {
        tipo: {
          select: {
            nombre: true,
            descripcion: true,
          },
        },
      },
    })

    return NextResponse.json({ ok: true, data: diligencia })
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessage = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }
    console.error('Error creating diligencia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear la diligencia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { ok: false, message: 'id es requerido', error: 'id es requerido' },
        { status: 400 }
      )
    }

    const parsed = zDiligenciaUpdate.safeParse(updateData)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    // Verify diligencia exists and belongs to user's office (via rol)
    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id,
        rol: {
          officeId: officeIdStr,
        },
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, message: 'Diligencia no encontrada o no pertenece a tu oficina', error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Update diligencia
    const updated = await prisma.diligencia.update({
      where: { id },
      data: parsed.data,
      include: {
        tipo: {
          select: {
            nombre: true,
            descripcion: true,
          },
        },
      },
    })

    return NextResponse.json({ ok: true, data: updated })
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessage = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }
    console.error('Error updating diligencia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar la diligencia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { ok: false, message: 'id es requerido', error: 'id es requerido' },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    // Verify diligencia exists and belongs to user's office (via rol)
    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id,
        rol: {
          officeId: officeIdStr,
        },
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, message: 'Diligencia no encontrada o no pertenece a tu oficina', error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // TODO: Check if user role is "Receptor" - for now allow deletion
    // const userRole = user.metadata?.role
    // if (userRole !== 'Receptor') {
    //   return NextResponse.json(
    //     { ok: false, message: 'Solo los receptores pueden eliminar diligencias' },
    //     { status: 403 }
    //   )
    // }

    await prisma.diligencia.delete({
      where: { id },
    })

    return NextResponse.json({ ok: true, message: 'Diligencia eliminada correctamente' })
  } catch (error) {
    console.error('Error deleting diligencia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al eliminar la diligencia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}
