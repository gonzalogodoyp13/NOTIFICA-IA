// API route: /api/abogados
// GET: List all abogados for the current office
// POST: Create a new abogado with many bancos and many procuradores
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { AbogadoSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

const abogadoInclude = {
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
  procuradores: {
    include: {
      procurador: {
        select: {
          id: true,
          nombre: true,
        },
      },
    },
  },
} as const

function mapAbogado(abogado: {
  id: number
  nombre: string | null
  rut: string | null
  direccion: string | null
  comuna: string | null
  telefono: string | null
  email: string | null
  createdAt: Date
  bancos: Array<{ banco: { id: number; nombre: string } }>
  procuradores: Array<{ procurador: { id: number; nombre: string } }>
}) {
  return {
    ...abogado,
    createdAt: abogado.createdAt.toISOString(),
    procuradores: abogado.procuradores
      .map((item) => item.procurador)
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  }
}

async function getValidatedBancoIds(officeId: number, bancoIds?: number[]) {
  if (!bancoIds || bancoIds.length === 0) {
    return []
  }

  const bancos = await prisma.banco.findMany({
    where: {
      id: { in: bancoIds },
      officeId,
    },
    select: { id: true },
  })

  if (bancos.length !== bancoIds.length) {
    throw new Error('Uno o mas bancos no encontrados o no pertenecen a tu oficina')
  }

  return bancoIds
}

async function getValidatedProcuradorIds(officeId: number, procuradorIds?: number[]) {
  if (!procuradorIds || procuradorIds.length === 0) {
    return []
  }

  const procuradores = await prisma.procurador.findMany({
    where: {
      id: { in: procuradorIds },
      officeId,
    },
    select: { id: true },
  })

  if (procuradores.length !== procuradorIds.length) {
    throw new Error('Uno o mas procuradores no encontrados o no pertenecen a tu oficina')
  }

  return procuradorIds
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const bancoIdParam = req.nextUrl.searchParams.get('bancoId')
    const bancoId = bancoIdParam ? parseInt(bancoIdParam, 10) : null

    if (bancoIdParam && Number.isNaN(bancoId)) {
      return NextResponse.json(
        { ok: false, message: 'bancoId invalido', error: 'bancoId invalido' },
        { status: 400 }
      )
    }

    const abogados = await prisma.abogado.findMany({
      where: {
        officeId: user.officeId,
        ...(bancoId
          ? {
              bancos: {
                some: {
                  bancoId,
                  officeId: user.officeId,
                },
              },
            }
          : {}),
      },
      include: abogadoInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ ok: true, data: abogados.map(mapAbogado) })
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

    const bancoIds = await getValidatedBancoIds(user.officeId, parsed.data.bancoIds)
    const procuradorIds = await getValidatedProcuradorIds(user.officeId, parsed.data.procuradorIds)

    const abogado = await prisma.$transaction(async (tx) => {
      const createdAbogado = await tx.abogado.create({
        data: {
          nombre: parsed.data.nombre,
          telefono: parsed.data.telefono,
          email: parsed.data.email,
          officeId: user.officeId,
        },
      })

      if (bancoIds.length > 0) {
        await tx.abogadoBanco.createMany({
          data: bancoIds.map((bancoId) => ({
            officeId: user.officeId,
            abogadoId: createdAbogado.id,
            bancoId,
          })),
          skipDuplicates: true,
        })
      }

      if (procuradorIds.length > 0) {
        await tx.procuradorAbogado.createMany({
          data: procuradorIds.map((procuradorId) => ({
            officeId: user.officeId,
            abogadoId: createdAbogado.id,
            procuradorId,
          })),
          skipDuplicates: true,
        })
      }

      if (parsed.data.newProcuradores?.length) {
        const createdProcuradores = await Promise.all(
          parsed.data.newProcuradores.map((procurador) =>
            tx.procurador.create({
              data: {
                officeId: user.officeId,
                nombre: procurador.nombre.trim(),
                email: procurador.email?.trim() || null,
                telefono: procurador.telefono?.trim() || null,
                notas: procurador.notas?.trim() || null,
              },
              select: { id: true },
            })
          )
        )

        await tx.procuradorAbogado.createMany({
          data: createdProcuradores.map((procurador) => ({
            officeId: user.officeId,
            abogadoId: createdAbogado.id,
            procuradorId: procurador.id,
          })),
          skipDuplicates: true,
        })
      }

      return createdAbogado
    })

    const abogadoWithRelations = await prisma.abogado.findUnique({
      where: { id: abogado.id },
      include: abogadoInclude,
    })

    return NextResponse.json({ ok: true, data: abogadoWithRelations ? mapAbogado(abogadoWithRelations) : null })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el abogado'
    const status = errorMessage.includes('no encontrados') ? 400 : 500
    console.error('Error creating abogado:', error)
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status }
    )
  }
}
