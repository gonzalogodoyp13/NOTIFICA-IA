// API route: /api/demandas
// GET: List all demandas for the current office
// POST: Create a new demanda
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { DemandaSchema } from '@/lib/zodSchemas'

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

    const demandas = await prisma.demanda.findMany({
      where: { officeId: user.officeId },
      include: {
        tribunal: {
          select: {
            id: true,
            nombre: true,
          },
        },
        abogado: {
          select: {
            id: true,
            nombre: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        ejecutados: {
          include: {
            comuna: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: demandas })
  } catch (error) {
    console.error('Error fetching demandas:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener las demandas' },
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
    const parsed = DemandaSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors },
        { status: 400 }
      )
    }

    // Verify tribunalId belongs to user's office
    const tribunal = await prisma.tribunal.findFirst({
      where: {
        id: parsed.data.tribunalId,
        officeId: user.officeId,
      },
    })

    if (!tribunal) {
      return NextResponse.json(
        { ok: false, error: 'Tribunal no encontrado o no pertenece a tu oficina' },
        { status: 400 }
      )
    }

    // Verify abogadoId belongs to user's office
    const abogado = await prisma.abogado.findFirst({
      where: {
        id: parsed.data.abogadoId,
        officeId: user.officeId,
      },
    })

    if (!abogado) {
      return NextResponse.json(
        { ok: false, error: 'Abogado no encontrado o no pertenece a tu oficina' },
        { status: 400 }
      )
    }

    // Check if ROL already exists
    const existingDemanda = await prisma.demanda.findUnique({
      where: { rol: parsed.data.rol },
    })

    if (existingDemanda) {
      return NextResponse.json(
        { ok: false, error: 'El ROL ya existe' },
        { status: 400 }
      )
    }

    // Create demanda with ejecutados if provided
    const demanda = await prisma.demanda.create({
      data: {
        rol: parsed.data.rol,
        tribunalId: parsed.data.tribunalId,
        caratula: parsed.data.caratula,
        cuantia: parsed.data.cuantia,
        abogadoId: parsed.data.abogadoId,
        officeId: user.officeId,
        userId: user.id,
        ejecutados: parsed.data.ejecutados
          ? {
              create: parsed.data.ejecutados.map((ejecutado) => ({
                nombre: ejecutado.nombre,
                rut: ejecutado.rut,
                direccion: ejecutado.direccion,
                comunaId: ejecutado.comunaId,
                rvm: ejecutado.rvm,
              })),
            }
          : undefined,
      },
      include: {
        tribunal: {
          select: {
            id: true,
            nombre: true,
          },
        },
        abogado: {
          select: {
            id: true,
            nombre: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        ejecutados: {
          include: {
            comuna: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
    })

    // Log CREATE_DEMANDA action
    await prisma.auditLog.create({
      data: {
        userEmail: user.email,
        action: `CREATE_DEMANDA: ROL ${demanda.rol} - ${demanda.caratula}`,
      },
    })

    return NextResponse.json({ ok: true, data: demanda })
  } catch (error) {
    console.error('Error creating demanda:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al crear la demanda' },
      { status: 500 }
    )
  }
}

