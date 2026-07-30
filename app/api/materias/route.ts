import { withApiUser } from '@/lib/api/server'
// API route: /api/materias
// GET: List all materias for the current office
// POST: Create a new materia
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MateriaSchema } from '@/lib/zodSchemas'
import { recordSettingsEvent } from '@/lib/audit/businessEvents'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.materias', async user => {
  try {

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

  })
}

export async function POST(req: NextRequest) {
  return withApiUser(req, 'post.materias', async user => {
  try {

    const body = await req.json()
    const parsed = MateriaSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const materia = await prisma.$transaction(async tx => {
      const created = await tx.materia.create({ data: { ...parsed.data, officeId: user.officeId } })
      await recordSettingsEvent(tx, user, { resource: 'Materia', action: 'created', recordId: created.id })
      return created
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

  })
}

