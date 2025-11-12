// API route: /api/abogados
// GET: List all abogados for the current office (with banco relation)
// POST: Create a new abogado
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { AbogadoSchema } from '@/lib/zodSchemas'

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

    const abogados = await prisma.abogado.findMany({
      where: { officeId: user.officeId },
      include: {
        banco: {
          select: {
            nombre: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ ok: true, data: abogados })
  } catch (error) {
    console.error('Error fetching abogados:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los abogados'
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
    const parsed = AbogadoSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    // Verify bancoId belongs to user's office if provided
    if (parsed.data.bancoId) {
      const banco = await prisma.banco.findFirst({
        where: {
          id: parsed.data.bancoId,
          officeId: user.officeId,
        },
      })

      if (!banco) {
        return NextResponse.json(
          { ok: false, message: 'Banco no encontrado o no pertenece a tu oficina', error: 'Banco no encontrado o no pertenece a tu oficina' },
          { status: 400 }
        )
      }
    }

    const abogado = await prisma.abogado.create({
      data: {
        ...parsed.data,
        officeId: user.officeId,
      },
      include: {
        banco: {
          select: {
            nombre: true,
          },
        },
      },
    })

    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `Creó nuevo Abogado: ${abogado.nombre || 'Sin nombre'}`,
      },
    })

    return NextResponse.json({ ok: true, data: abogado })
  } catch (error) {
    console.error('Error creating abogado:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el abogado'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

