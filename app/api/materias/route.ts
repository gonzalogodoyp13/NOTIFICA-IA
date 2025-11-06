// API route: /api/materias
// GET: List all materias for the current office
// POST: Create a new materia
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { MateriaSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const materias = await prisma.materia.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: materias })
  } catch (error) {
    console.error('Error fetching materias:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener las materias' },
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
    const parsed = MateriaSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const materia = await prisma.materia.create({
      data: {
        ...parsed.data,
        officeId: user.officeId,
      },
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Creó nueva Materia: ${materia.nombre}`,
      },
    })

    return NextResponse.json({ ok: true, data: materia })
  } catch (error) {
    console.error('Error creating materia:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al crear la materia' },
      { status: 500 }
    )
  }
}

