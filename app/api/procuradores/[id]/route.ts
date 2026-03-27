// API route: /api/procuradores/[id]
// GET: Get a single procurador
// PATCH: Update a procurador and optionally sync banco relations
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ProcuradorUpdateSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

function normalizeBancoIds(bancoIds?: number[]) {
  if (!Array.isArray(bancoIds)) return undefined

  return Array.from(
    new Set(
      bancoIds.filter((value): value is number => Number.isInteger(value) && value > 0)
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
        { ok: false, message: 'ID invÃ¡lido', error: 'ID invÃ¡lido' },
        { status: 400 }
      )
    }

    const procurador = await prisma.procurador.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
      include: {
        abogado: {
          select: {
            id: true,
            nombre: true,
          },
        },
        bancos: {
          select: {
            bancoId: true,
            activo: true,
            alias: true,
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

    if (!procurador) {
      return NextResponse.json(
        { ok: false, message: 'Procurador no encontrado o no pertenece a tu oficina', error: 'Procurador no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: procurador })
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
        { ok: false, message: 'ID invÃ¡lido', error: 'ID invÃ¡lido' },
        { status: 400 }
      )
    }

    const existingProcurador = await prisma.procurador.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
      include: {
        bancos: {
          select: {
            id: true,
            bancoId: true,
          },
        },
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

    const updateData: {
      nombre?: string
      email?: string | null
      telefono?: string | null
      notas?: string | null
      abogadoId?: number | null
    } = {}

    if (parsed.data.nombre !== undefined) updateData.nombre = parsed.data.nombre.trim()
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email?.trim() || null
    if (parsed.data.telefono !== undefined) updateData.telefono = parsed.data.telefono?.trim() || null
    if (parsed.data.notas !== undefined) updateData.notas = parsed.data.notas?.trim() || null

    if (parsed.data.abogadoId !== undefined) {
      if (parsed.data.abogadoId !== null) {
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

      updateData.abogadoId = parsed.data.abogadoId
    }

    const normalizedBancoIds = normalizeBancoIds(parsed.data.bancoIds)

    if (normalizedBancoIds) {
      const bancos = await prisma.banco.findMany({
        where: {
          id: { in: normalizedBancoIds },
          officeId: user.officeId,
        },
        select: { id: true },
      })

      if (bancos.length !== normalizedBancoIds.length) {
        return NextResponse.json(
          { ok: false, message: 'Uno o mas bancos no encontrados o no pertenecen a tu oficina', error: 'Bancos invalidos' },
          { status: 400 }
        )
      }
    }

    const procurador = await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.procurador.update({
          where: { id },
          data: updateData,
        })
      }

      if (normalizedBancoIds) {
        const currentBancoIds = existingProcurador.bancos.map((banco) => banco.bancoId)
        const bancoIdsToCreate = normalizedBancoIds.filter((bancoId) => !currentBancoIds.includes(bancoId))
        const bancoIdsToDelete = currentBancoIds.filter((bancoId) => !normalizedBancoIds.includes(bancoId))

        if (bancoIdsToCreate.length > 0) {
          await tx.bancoProcurador.createMany({
            data: bancoIdsToCreate.map((bancoId) => ({
              officeId: user.officeId,
              bancoId,
              procuradorId: id,
              activo: true,
            })),
            skipDuplicates: true,
          })
        }

        if (bancoIdsToDelete.length > 0) {
          await tx.bancoProcurador.deleteMany({
            where: {
              officeId: user.officeId,
              procuradorId: id,
              bancoId: { in: bancoIdsToDelete },
            },
          })
        }
      }

      return tx.procurador.findUniqueOrThrow({
        where: { id },
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
    })

    return NextResponse.json({ ok: true, data: procurador })
  } catch (error) {
    console.error('Error updating procurador:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar el procurador'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}
