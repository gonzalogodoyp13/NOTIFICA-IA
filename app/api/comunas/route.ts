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
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const comunas = await prisma.comuna.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: comunas })
  } catch (error) {
    console.error('Error fetching comunas:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener las comunas' },
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
    const parsed = ComunaSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const comuna = await prisma.comuna.create({
      data: {
        ...parsed.data,
        officeId: user.officeId,
      },
    })

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Creó nueva Comuna: ${comuna.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json(
      { ok: true, data: comuna, id: comuna.id },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating comuna:', error)
    const errorMessage = error?.message || 'Error al crear la comuna'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

