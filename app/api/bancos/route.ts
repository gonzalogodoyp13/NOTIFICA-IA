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
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const bancos = await prisma.banco.findMany({
      where: { officeId: user.officeId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: bancos })
  } catch (error) {
    console.error('Error fetching bancos:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener los bancos' },
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
    const parsed = BancoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    const banco = await prisma.banco.create({
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
          action: `Creó nuevo Banco: ${banco.nombre}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json(
      { ok: true, data: banco, id: banco.id },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating banco:', error)
    const errorMessage = error?.message || 'Error al crear el banco'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

