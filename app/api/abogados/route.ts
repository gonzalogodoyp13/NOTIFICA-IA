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
        { ok: false, error: 'No autorizado' },
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
    })

    return NextResponse.json({ ok: true, data: abogados })
  } catch (error) {
    console.error('Error fetching abogados:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener los abogados' },
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
    const parsed = AbogadoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
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
          { ok: false, error: 'Banco no encontrado o no pertenece a tu oficina' },
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

    // Create audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `Creó nuevo Abogado: ${abogado.nombre || 'Sin nombre'}`,
        },
      })
    } catch (auditError) {
      console.error('Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json(
      { ok: true, data: abogado, id: abogado.id },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating abogado:', error)
    const errorMessage = error?.message || 'Error al crear el abogado'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

