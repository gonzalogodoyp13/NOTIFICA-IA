// API route: /api/procuradores/[id]
// GET: Get a single procurador
// PATCH: Update a procurador and sync abogado relations
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ProcuradorUpdateSchema } from '@/lib/zodSchemas'
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

function normalizeAbogadoIds(abogadoIds?: number[]) {
  if (!Array.isArray(abogadoIds)) return undefined

  return Array.from(
    new Set(
      abogadoIds.filter((value): value is number => Number.isInteger(value) && value > 0)
    )
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, message: 'ID invalido', error: 'ID invalido' },
        { status: 400 }
      )
    }

    const procurador = await prisma.procurador.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
      include: procuradorInclude,
    })

    if (!procurador) {
      return NextResponse.json(
        { ok: false, message: 'Procurador no encontrado o no pertenece a tu oficina', error: 'Procurador no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: mapProcuradorListItem(procurador) })
  } catch (error) {
    console.error('Error fetching procurador:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener el procurador'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, message: 'ID invalido', error: 'ID invalido' },
        { status: 400 }
      )
    }

    const existingProcurador = await prisma.procurador.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingProcurador) {
      return NextResponse.json(
        { ok: false, message: 'Procurador no encontrado o no pertenece a tu oficina', error: 'Procurador no encontrado' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = ProcuradorUpdateSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    const normalizedAbogadoIds = normalizeAbogadoIds(parsed.data.abogadoIds)

    if (normalizedAbogadoIds) {
      const abogados = await prisma.abogado.findMany({
        where: {
          id: { in: normalizedAbogadoIds },
          officeId: user.officeId,
        },
        select: { id: true },
      })

      if (abogados.length !== normalizedAbogadoIds.length) {
        return NextResponse.json(
          { ok: false, message: 'Uno o mas abogados no encontrados o no pertenecen a tu oficina', error: 'Abogados invalidos' },
          { status: 400 }
        )
      }
    }

    const procurador = await prisma.$transaction(async (tx) => {
      const updateData: {
        nombre?: string
        email?: string | null
        telefono?: string | null
        notas?: string | null
      } = {}

      if (parsed.data.nombre !== undefined) updateData.nombre = parsed.data.nombre.trim()
      if (parsed.data.email !== undefined) updateData.email = parsed.data.email?.trim() || null
      if (parsed.data.telefono !== undefined) updateData.telefono = parsed.data.telefono?.trim() || null
      if (parsed.data.notas !== undefined) updateData.notas = parsed.data.notas?.trim() || null

      if (Object.keys(updateData).length > 0) {
        await tx.procurador.update({
          where: { id },
          data: updateData,
        })
      }

      if (normalizedAbogadoIds) {
        await tx.procuradorAbogado.deleteMany({
          where: {
            officeId: user.officeId,
            procuradorId: id,
          },
        })

        if (normalizedAbogadoIds.length > 0) {
          await tx.procuradorAbogado.createMany({
            data: normalizedAbogadoIds.map((abogadoId) => ({
              officeId: user.officeId,
              procuradorId: id,
              abogadoId,
            })),
            skipDuplicates: true,
          })
        }
      }

      return tx.procurador.findUniqueOrThrow({
        where: { id },
        include: procuradorInclude,
      })
    })

    return NextResponse.json({ ok: true, data: mapProcuradorListItem(procurador) })
  } catch (error) {
    console.error('Error updating procurador:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar el procurador'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}
