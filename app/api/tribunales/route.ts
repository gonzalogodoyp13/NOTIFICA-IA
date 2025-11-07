// API route: /api/tribunales
// GET: List all tribunales for the current office
// POST: Create a new tribunal
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { TribunalSchema } from '@/lib/zodSchemas'

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

    const tribunales = await prisma.tribunal.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: tribunales })
  } catch (error) {
    console.error('Error fetching tribunales:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener los tribunales' },
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
    const parsed = TribunalSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const tribunal = await prisma.tribunal.create({
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
          action: `Creó nuevo Tribunal: ${tribunal.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json(
      { ok: true, data: tribunal, id: tribunal.id },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating tribunal:', error)
    const errorMessage = error?.message || 'Error al crear el tribunal'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

