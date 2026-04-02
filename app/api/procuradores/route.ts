// API route: /api/procuradores
// GET: List all procuradores for the current office
// POST: Create a new procurador and link it to one or many abogados
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ProcuradorSchema } from '@/lib/zodSchemas'
import { mapProcuradorListItem } from '@/lib/procuradores'

export const dynamic = 'force-dynamic'

const procuradorInclude = {
  abogados: {
    include: {
      abogado: {
        select: {
          id: true,
          nombre: true,
          bancos: {
            select: {
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
      },
    },
  },
} as const

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null
}

function normalizeAbogadoIds(abogadoIds?: number[]) {
  if (!Array.isArray(abogadoIds)) return []

  return Array.from(
    new Set(
      abogadoIds.filter((value): value is number => Number.isInteger(value) && value > 0)
    )
  )
}

async function validateAbogadoIds(officeId: number, abogadoIds: number[]) {
  if (abogadoIds.length === 0) return []

  const abogados = await prisma.abogado.findMany({
    where: {
      id: { in: abogadoIds },
      officeId,
    },
    select: { id: true },
  })

  if (abogados.length !== abogadoIds.length) {
    throw new Error('Uno o mas abogados no encontrados o no pertenecen a tu oficina')
  }

  return abogadoIds
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

    const searchParams = req.nextUrl.searchParams
    const bancoIdParam = searchParams.get('bancoId')
    const abogadoIdParam = searchParams.get('abogadoId')

    const bancoId = bancoIdParam ? parseInt(bancoIdParam, 10) : null
    const abogadoId = abogadoIdParam ? parseInt(abogadoIdParam, 10) : null

    if (bancoIdParam && Number.isNaN(bancoId)) {
      return NextResponse.json(
        { ok: false, message: 'bancoId invalido', error: 'bancoId invalido' },
        { status: 400 }
      )
    }

    if (abogadoIdParam && Number.isNaN(abogadoId)) {
      return NextResponse.json(
        { ok: false, message: 'abogadoId invalido', error: 'abogadoId invalido' },
        { status: 400 }
      )
    }

    const procuradores = await prisma.procurador.findMany({
      where: {
        officeId: user.officeId,
        ...(abogadoId
          ? {
              abogados: {
                some: {
                  abogadoId,
                  officeId: user.officeId,
                },
              },
            }
          : {}),
        ...(bancoId
          ? {
              abogados: {
                some: {
                  officeId: user.officeId,
                  abogado: {
                    bancos: {
                      some: {
                        bancoId,
                        officeId: user.officeId,
                      },
                    },
                  },
                },
              },
            }
          : {}),
      },
      include: procuradorInclude,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: procuradores.map(mapProcuradorListItem) })
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
    const abogadoIds = normalizeAbogadoIds(parsed.data.abogadoIds)

    try {
      await validateAbogadoIds(user.officeId, abogadoIds)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Abogados invalidos'
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
              include: procuradorInclude,
            })
          : await tx.procurador.create({
              data: {
                officeId: user.officeId,
                nombre,
                email,
                telefono,
                notas,
              },
              include: procuradorInclude,
            })

      if (abogadoIds.length > 0) {
        await tx.procuradorAbogado.createMany({
          data: abogadoIds.map((abogadoId) => ({
            officeId: user.officeId,
            abogadoId,
            procuradorId: procurador.id,
          })),
          skipDuplicates: true,
        })
      }

      const procuradorWithRelations = await tx.procurador.findUniqueOrThrow({
        where: { id: procurador.id },
        include: procuradorInclude,
      })

      return {
        procurador: mapProcuradorListItem(procuradorWithRelations),
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
