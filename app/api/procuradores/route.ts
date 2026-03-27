// API route: /api/procuradores
// GET: List all procuradores for the current office (optionally filtered by bancoId)
// POST: Create a new procurador and optionally link it to one or many bancos
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ProcuradorSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null
}

function normalizeBancoIds(bancoId?: number, bancoIds?: number[]) {
  const merged = [
    ...(Array.isArray(bancoIds) ? bancoIds : []),
    ...(typeof bancoId === 'number' ? [bancoId] : []),
  ]

  return Array.from(
    new Set(
      merged.filter((value): value is number => Number.isInteger(value) && value > 0)
    )
  )
}

async function getBancoIdsForOffice(officeId: number, bancoIds: number[]) {
  if (bancoIds.length === 0) return []

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

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const bancoIdParam = searchParams.get('bancoId')

    if (bancoIdParam) {
      const bancoId = parseInt(bancoIdParam, 10)
      if (Number.isNaN(bancoId)) {
        return NextResponse.json(
          { ok: false, message: 'bancoId invalido', error: 'bancoId invalido' },
          { status: 400 }
        )
      }

      const banco = await prisma.banco.findFirst({
        where: { id: bancoId, officeId: user.officeId },
      })

      if (!banco) {
        return NextResponse.json(
          { ok: false, message: 'Banco no encontrado', error: 'Banco no encontrado' },
          { status: 404 }
        )
      }

      const procuradores = await prisma.procurador.findMany({
        where: {
          officeId: user.officeId,
          bancos: {
            some: {
              bancoId,
              officeId: user.officeId,
            },
          },
        },
        include: {
          abogado: {
            select: {
              id: true,
              nombre: true,
            },
          },
          bancos: {
            where: {
              bancoId,
              officeId: user.officeId,
            },
            select: {
              activo: true,
              alias: true,
              bancoId: true,
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
      })

      const mapped = procuradores.map((procurador) => ({
        id: procurador.id,
        nombre: procurador.nombre,
        email: procurador.email,
        telefono: procurador.telefono,
        notas: procurador.notas,
        abogadoId: procurador.abogadoId,
        abogado: procurador.abogado,
        activo: procurador.activo,
        bancos: procurador.bancos,
        bancoProcurador: procurador.bancos[0] ?? null,
        createdAt: procurador.createdAt.toISOString(),
        updatedAt: procurador.updatedAt.toISOString(),
      }))

      return NextResponse.json({ ok: true, data: mapped })
    }

    const procuradores = await prisma.procurador.findMany({
      where: { officeId: user.officeId },
      include: {
        abogado: {
          select: {
            id: true,
            nombre: true,
          },
        },
        bancos: {
          select: {
            activo: true,
            alias: true,
            bancoId: true,
            banco: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
          orderBy: {
            banco: {
              nombre: 'asc',
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const mapped = procuradores.map((procurador) => ({
      id: procurador.id,
      nombre: procurador.nombre,
      email: procurador.email,
      telefono: procurador.telefono,
      notas: procurador.notas,
      abogadoId: procurador.abogadoId,
      abogado: procurador.abogado,
      activo: procurador.activo,
      bancos: procurador.bancos,
      bancoProcurador: null,
      createdAt: procurador.createdAt.toISOString(),
      updatedAt: procurador.updatedAt.toISOString(),
    }))

    return NextResponse.json({ ok: true, data: mapped })
  } catch (error) {
    console.error('Error fetching procuradores:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los procuradores'
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
    const parsed = ProcuradorSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const nombre = parsed.data.nombre.trim().replace(/\s+/g, ' ')
    const normalizedNombre = normalizeName(nombre)
    const email = normalizeEmail(parsed.data.email)
    const telefono = parsed.data.telefono?.trim() || null
    const notas = parsed.data.notas?.trim() || null
    const bancoIds = normalizeBancoIds(parsed.data.bancoId, parsed.data.bancoIds)

    if (parsed.data.abogadoId) {
      const abogado = await prisma.abogado.findFirst({
        where: {
          id: parsed.data.abogadoId,
          officeId: user.officeId,
        },
      })

      if (!abogado) {
        return NextResponse.json(
          { ok: false, message: 'Abogado no encontrado o no pertenece a tu oficina', error: 'Abogado no encontrado' },
          { status: 404 }
        )
      }
    }

    try {
      await getBancoIdsForOffice(user.officeId, bancoIds)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Bancos invalidos'
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const existingProcuradores = await prisma.procurador.findMany({
      where: {
        officeId: user.officeId,
      },
      select: {
        id: true,
        nombre: true,
        email: true,
      },
    })

    const existingProcurador = existingProcuradores.find((procurador) => {
      if (normalizeName(procurador.nombre) !== normalizedNombre) return false

      const existingEmail = normalizeEmail(procurador.email)

      if (email && existingEmail) {
        return existingEmail === email
      }

      return !email && !existingEmail
    })

    const result = await prisma.$transaction(async (tx) => {
      const procurador =
        existingProcurador
          ? await tx.procurador.findUniqueOrThrow({
              where: { id: existingProcurador.id },
              include: {
                abogado: {
                  select: {
                    id: true,
                    nombre: true,
                  },
                },
              },
            })
          : await tx.procurador.create({
              data: {
                officeId: user.officeId,
                nombre,
                email,
                telefono,
                notas,
                abogadoId: parsed.data.abogadoId || null,
              },
              include: {
                abogado: {
                  select: {
                    id: true,
                    nombre: true,
                  },
                },
              },
            })

      if (bancoIds.length > 0) {
        await tx.bancoProcurador.createMany({
          data: bancoIds.map((bancoId) => ({
            officeId: user.officeId,
            bancoId,
            procuradorId: procurador.id,
            alias: parsed.data.alias?.trim() || null,
            activo: true,
          })),
          skipDuplicates: true,
        })
      }

      const procuradorWithRelations = await tx.procurador.findUniqueOrThrow({
        where: { id: procurador.id },
        include: {
          abogado: {
            select: {
              id: true,
              nombre: true,
            },
          },
          bancos: {
            select: {
              activo: true,
              alias: true,
              bancoId: true,
              banco: {
                select: {
                  id: true,
                  nombre: true,
                },
              },
            },
            orderBy: {
              banco: {
                nombre: 'asc',
              },
            },
          },
        },
      })

      return {
        procurador: {
          id: procuradorWithRelations.id,
          nombre: procuradorWithRelations.nombre,
          email: procuradorWithRelations.email,
          telefono: procuradorWithRelations.telefono,
          notas: procuradorWithRelations.notas,
          abogadoId: procuradorWithRelations.abogadoId,
          abogado: procuradorWithRelations.abogado,
          activo: procuradorWithRelations.activo,
          bancos: procuradorWithRelations.bancos,
          bancoProcurador: null,
          createdAt: procuradorWithRelations.createdAt.toISOString(),
          updatedAt: procuradorWithRelations.updatedAt.toISOString(),
        },
        reusedExisting: Boolean(existingProcurador),
      }
    })

    return NextResponse.json({
      ok: true,
      data: result.procurador,
      reusedExisting: result.reusedExisting,
    })
  } catch (error) {
    console.error('Error creating procurador:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el procurador'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}
