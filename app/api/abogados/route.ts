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
            id: true,
            nombre: true,
          },
        },
        bancos: {  // NUEVO - incluir lista de bancos via join
          include: {
            banco: {
              select: {
                id: true,
                nombre: true,
              },
            },
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

    // Validar bancoIds (si se proporciona)
    if (parsed.data.bancoIds && parsed.data.bancoIds.length > 0) {
      // Verificar que todos los bancos pertenezcan a la oficina del usuario
      const bancos = await prisma.banco.findMany({
        where: {
          id: { in: parsed.data.bancoIds },
          officeId: user.officeId,
        },
      })

      if (bancos.length !== parsed.data.bancoIds.length) {
        return NextResponse.json(
          { ok: false, message: 'Uno o más bancos no encontrados o no pertenecen a tu oficina', error: 'Bancos inválidos' },
          { status: 400 }
        )
      }
    }

    // Verify bancoId belongs to user's office if provided (legacy support)
    if (parsed.data.bancoId && !parsed.data.bancoIds) {
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

    // Determinar bancoId principal
    const primaryBancoId = parsed.data.bancoIds && parsed.data.bancoIds.length > 0 
      ? parsed.data.bancoIds[0] 
      : parsed.data.bancoId || null

    // Crear Abogado con bancoId principal
    const abogado = await prisma.abogado.create({
      data: {
        nombre: parsed.data.nombre,
        telefono: parsed.data.telefono,
        email: parsed.data.email,
        bancoId: primaryBancoId,  // Primer banco como principal
        officeId: user.officeId,
      },
    })

    // Crear relaciones en AbogadoBanco
    if (parsed.data.bancoIds && parsed.data.bancoIds.length > 0) {
      await prisma.abogadoBanco.createMany({
        data: parsed.data.bancoIds.map(bancoId => ({
          officeId: user.officeId,
          abogadoId: abogado.id,
          bancoId: bancoId,
        })),
      })
    }

    // Incluir relaciones en la respuesta
    const abogadoWithRelations = await prisma.abogado.findUnique({
      where: { id: abogado.id },
      include: {
        banco: {
          select: {
            id: true,
            nombre: true,
          },
        },
        bancos: {
          include: {
            banco: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ ok: true, data: abogadoWithRelations })
  } catch (error) {
    console.error('Error creating abogado:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el abogado'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

