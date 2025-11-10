// API route: /api/diligencia-tipos
// GET: List all diligencia tipos for the current office
// POST: Create a new diligencia tipo
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { DiligenciaTipoSchema } from '@/lib/zodSchemas'

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

    const officeIdStr = String(user.officeId)

    const diligencias = await prisma.diligenciaTipo.findMany({
      where: { officeId: officeIdStr },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: diligencias })
  } catch (error) {
    console.error('Error fetching diligencia tipos:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener los tipos de diligencias' },
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
    const parsed = DiligenciaTipoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const officeIdStr = String(user.officeId)

    const diligencia = await prisma.diligenciaTipo.create({
      data: {
        ...parsed.data,
        officeId: officeIdStr,
      },
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Creó nuevo Tipo de Diligencia: ${diligencia.nombre}`,
      },
    })

    return NextResponse.json({ ok: true, data: diligencia })
  } catch (error) {
    console.error('Error creating diligencia tipo:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al crear el tipo de diligencia' },
      { status: 500 }
    )
  }
}

