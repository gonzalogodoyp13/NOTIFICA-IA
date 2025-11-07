// API route: /api/diligencias
// GET: List all diligencias tipos for the current office
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

    const diligencias = await prisma.diligenciaTipos.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: diligencias })
  } catch (error) {
    console.error('Error fetching diligencias:', error)
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

    const diligencia = await prisma.diligenciaTipos.create({
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
          action: `Creó nuevo Tipo de Diligencia: ${diligencia.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json(
      { ok: true, data: diligencia, id: diligencia.id },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating diligencia:', error)
    const errorMessage = error?.message || 'Error al crear el tipo de diligencia'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

