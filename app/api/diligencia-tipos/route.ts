import { withApiUser } from '@/lib/api/server'
// API route: /api/diligencia-tipos
// GET: List all diligencia tipos for the current office
// POST: Create a new diligencia tipo
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DiligenciaTipoSchema } from '@/lib/zodSchemas'
import { recordSettingsEvent } from '@/lib/audit/businessEvents'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.diligencia-tipos', async user => {
  try {

    const diligencias = await prisma.diligenciaTipo.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ ok: true, data: diligencias })
  } catch (error) {
    console.error('Error fetching diligencia tipos:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los tipos de diligencias'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }

  })
}

export async function POST(req: NextRequest) {
  return withApiUser(req, 'post.diligencia-tipos', async user => {
  try {

    const body = await req.json()
    const parsed = DiligenciaTipoSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const diligencia = await prisma.$transaction(async tx => {
      const created = await tx.diligenciaTipo.create({ data: { ...parsed.data, officeId: user.officeId } })
      await recordSettingsEvent(tx, user, { resource: 'DiligenciaTipo', action: 'created', recordId: created.id })
      return created
    })

    return NextResponse.json({ ok: true, data: diligencia })
  } catch (error) {
    console.error('Error creating diligencia tipo:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el tipo de diligencia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }

  })
}

