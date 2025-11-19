// API route: /api/comunas
// GET: List all comunas for the current office
// POST: Create a new comuna
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ComunaSchema } from '@/lib/zodSchemas'

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

    const comunas = await prisma.comuna.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ ok: true, data: comunas })
  } catch (error) {
    console.error('Error fetching comunas:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener las comunas'
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
    const parsed = ComunaSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const comuna = await prisma.comuna.create({
      data: {
        ...parsed.data,
        officeId: user.officeId,
      },
    })

    return NextResponse.json({ ok: true, data: comuna })
  } catch (error) {
    console.error('Error creating comuna:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear la comuna'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

