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
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const materias = await prisma.materia.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ ok: true, data: materias })
  } catch (error) {
    console.error('Error fetching materias:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener las materias'
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
    const parsed = MateriaSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const materia = await prisma.materia.create({
      data: {
        ...parsed.data,
        officeId: user.officeId,
      },
    })

    return NextResponse.json({ ok: true, data: materia })
  } catch (error) {
    console.error('Error creating materia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear la materia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

