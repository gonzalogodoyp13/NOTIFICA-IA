// API route: /api/bancos
// GET: List all bancos for the current office
// POST: Create a new banco
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { BancoSchema } from '@/lib/zodSchemas'

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

    const bancos = await prisma.banco.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ ok: true, data: bancos })
  } catch (error) {
    console.error('Error fetching bancos:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los bancos'
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
    const parsed = BancoSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const banco = await prisma.banco.create({
      data: {
        ...parsed.data,
        officeId: user.officeId,
      },
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Creó nuevo Banco: ${banco.nombre}`,
      },
    })

    return NextResponse.json({ ok: true, data: banco })
  } catch (error) {
    console.error('Error creating banco:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el banco'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

