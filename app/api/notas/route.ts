// API route: /api/notas
// GET: List notes (q search, page)
// POST: Add new Nota (validate zNota)
// DELETE: Only author or Receptor can delete
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { zNota } from '@/lib/validations/nota'
import { ZodError } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const rolId = searchParams.get('rolId')
    const q = searchParams.get('q') || undefined
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    if (!rolId) {
      return NextResponse.json(
        { ok: false, error: 'rolId es requerido' },
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
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Build where clause
    const where: any = {
      rolId,
    }

    if (q) {
      where.contenido = {
        contains: q,
        mode: 'insensitive',
      }
    }

    // Get total count for pagination
    const total = await prisma.nota.count({ where })

    // Fetch notas
    const notas = await prisma.nota.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return NextResponse.json({
      ok: true,
      data: notas,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error fetching notas:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener las notas' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const parsed = zNota.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
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
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Create Nota
    const nota = await prisma.nota.create({
      data: {
        rolId: parsed.data.rolId,
        userId: user.id,
        contenido: parsed.data.contenido,
      },
    })

    return NextResponse.json({ ok: true, data: nota })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: error.errors },
        { status: 400 }
      )
    }
    console.error('Error creating nota:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al crear la nota' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'id es requerido' },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    // Verify nota exists and belongs to user's office (via rol)
    const nota = await prisma.nota.findFirst({
      where: {
        id,
        rol: {
          officeId: officeIdStr,
        },
      },
    })

    if (!nota) {
      return NextResponse.json(
        { ok: false, error: 'Nota no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Check if user is author or has Receptor role
    // TODO: Check user role from metadata - for now allow if user is author
    const isAuthor = nota.userId === user.id
    // const userRole = user.metadata?.role
    // const isReceptor = userRole === 'Receptor'

    if (!isAuthor) {
      return NextResponse.json(
        { ok: false, error: 'Solo el autor o un Receptor pueden eliminar esta nota' },
        { status: 403 }
      )
    }

    await prisma.nota.delete({
      where: { id },
    })

    return NextResponse.json({ ok: true, message: 'Nota eliminada correctamente' })
  } catch (error) {
    console.error('Error deleting nota:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al eliminar la nota' },
      { status: 500 }
    )
  }
}

