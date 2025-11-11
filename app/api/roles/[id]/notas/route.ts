import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { NotaCreateSchema } from '@/lib/validations/rol-workspace'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const officeIdStr = String(user.officeId)

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: officeIdStr,
      },
      select: { id: true },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const notas = await prisma.nota.findMany({
      where: {
        rolId: rol.id,
      },
      orderBy: { createdAt: 'desc' },
    })

    const data = notas.map(nota => ({
      id: nota.id,
      contenido: nota.contenido,
      userId: nota.userId,
      createdAt: nota.createdAt.toISOString(),
    }))

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Error obteniendo notas:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener las notas del rol' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const officeIdStr = String(user.officeId)

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: officeIdStr,
      },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const parsed = NotaCreateSchema.safeParse(await req.json())

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const nota = await prisma.nota.create({
      data: {
        rolId: rol.id,
        userId: user.id,
        contenido: parsed.data.contenido,
      },
    })

    await logAudit({
      userEmail: user.email,
      userId: user.id,
      officeId: officeIdStr,
      rolId: rol.id,
      tabla: 'Nota',
      accion: 'Creó nota',
      diff: { notaId: nota.id },
    })

    return NextResponse.json({ ok: true, data: { ...nota, createdAt: nota.createdAt.toISOString() } })
  } catch (error) {
    console.error('Error creando nota:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al crear la nota' },
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
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const noteId = req.nextUrl.searchParams.get('noteId')

    if (!noteId) {
      return NextResponse.json(
        { ok: false, error: 'noteId es requerido en la query' },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    const nota = await prisma.nota.findFirst({
      where: {
        id: noteId,
        rol: {
          id: params.id,
          officeId: officeIdStr,
        },
      },
      select: {
        id: true,
        rolId: true,
      },
    })

    if (!nota) {
      return NextResponse.json(
        { ok: false, error: 'Nota no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    await prisma.nota.delete({
      where: { id: nota.id },
    })

    await logAudit({
      userEmail: user.email,
      userId: user.id,
      officeId: officeIdStr,
      rolId: nota.rolId,
      tabla: 'Nota',
      accion: 'Eliminó nota',
      diff: { notaId: nota.id },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error eliminando nota:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al eliminar la nota' },
      { status: 500 }
    )
  }
}

