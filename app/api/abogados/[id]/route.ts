// API route: /api/abogados/[id]
// PUT: Update an abogado
// DELETE: Delete an abogado
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { AbogadoSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

export async function PUT(
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
        { ok: false, message: 'ID inválido', error: 'ID inválido' },
        { status: 400 }
      )
    }

    const existingAbogado = await prisma.abogado.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingAbogado) {
      return NextResponse.json(
        { ok: false, message: 'Abogado no encontrado o no pertenece a tu oficina', error: 'Abogado no encontrado o no pertenece a tu oficina' },
        { status: 404 }
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

    if (parsed.data.bancoIds && parsed.data.bancoIds.length > 0) {
      const bancos = await prisma.banco.findMany({
        where: {
          id: { in: parsed.data.bancoIds },
          officeId: user.officeId,
        },
        select: { id: true },
      })

      if (bancos.length !== parsed.data.bancoIds.length) {
        return NextResponse.json(
          { ok: false, message: 'Uno o más bancos no encontrados o no pertenecen a tu oficina', error: 'Bancos inválidos' },
          { status: 400 }
        )
      }
    }

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

    const selectedExistingProcuradores = parsed.data.procuradorIds?.length
      ? await prisma.procurador.findMany({
          where: {
            id: { in: parsed.data.procuradorIds },
            officeId: user.officeId,
          },
          select: { id: true },
        })
      : []

    if ((parsed.data.procuradorIds?.length ?? 0) !== selectedExistingProcuradores.length) {
      return NextResponse.json(
        { ok: false, message: 'Uno o más procuradores no encontrados o no pertenecen a tu oficina', error: 'Procuradores inválidos' },
        { status: 400 }
      )
    }

    const primaryBancoId = parsed.data.bancoIds && parsed.data.bancoIds.length > 0
      ? parsed.data.bancoIds[0]
      : parsed.data.bancoId ?? existingAbogado.bancoId

    const abogado = await prisma.$transaction(async (tx) => {
      const updatedAbogado = await tx.abogado.update({
        where: { id },
        data: {
          nombre: parsed.data.nombre,
          telefono: parsed.data.telefono,
          email: parsed.data.email,
          bancoId: primaryBancoId,
        },
      })

      if (parsed.data.bancoIds !== undefined) {
        await tx.abogadoBanco.deleteMany({
          where: {
            abogadoId: id,
            officeId: user.officeId,
          },
        })

        if (parsed.data.bancoIds.length > 0) {
          await tx.abogadoBanco.createMany({
            data: parsed.data.bancoIds.map((bancoId) => ({
              officeId: user.officeId,
              abogadoId: id,
              bancoId,
            })),
            skipDuplicates: true,
          })
        }
      }

      const shouldSyncProcuradores =
        parsed.data.procuradorIds !== undefined || parsed.data.newProcuradores !== undefined

      let procuradorIdsToLink = selectedExistingProcuradores.map((procurador) => procurador.id)

      if (shouldSyncProcuradores) {
        await tx.procurador.updateMany({
          where: {
            officeId: user.officeId,
            abogadoId: id,
            id: { notIn: procuradorIdsToLink },
          },
          data: {
            abogadoId: null,
          },
        })

        if (procuradorIdsToLink.length > 0) {
          await tx.procurador.updateMany({
            where: {
              officeId: user.officeId,
              id: { in: procuradorIdsToLink },
            },
            data: {
              abogadoId: id,
            },
          })
        }

        const createdProcuradores = parsed.data.newProcuradores?.length
          ? await Promise.all(
              parsed.data.newProcuradores.map((procurador) =>
                tx.procurador.create({
                  data: {
                    officeId: user.officeId,
                    abogadoId: id,
                    nombre: procurador.nombre.trim(),
                    email: procurador.email?.trim() || null,
                    telefono: procurador.telefono?.trim() || null,
                    notas: procurador.notas?.trim() || null,
                  },
                  select: { id: true },
                })
              )
            )
          : []

        procuradorIdsToLink = [
          ...procuradorIdsToLink,
          ...createdProcuradores.map((procurador) => procurador.id),
        ]
      }

      if (parsed.data.bancoIds?.length && procuradorIdsToLink.length > 0) {
        await tx.bancoProcurador.createMany({
          data: parsed.data.bancoIds.flatMap((bancoId) =>
            procuradorIdsToLink.map((procuradorId) => ({
              officeId: user.officeId,
              bancoId,
              procuradorId,
              activo: true,
            }))
          ),
          skipDuplicates: true,
        })
      }

      return updatedAbogado
    })

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
        procuradores: {
          select: {
            id: true,
            nombre: true,
          },
          orderBy: {
            nombre: 'asc',
          },
        },
      },
    })

    return NextResponse.json({ ok: true, data: abogadoWithRelations })
  } catch (error) {
    console.error('Error updating abogado:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar el abogado'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function DELETE(
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
        { ok: false, message: 'ID inválido', error: 'ID inválido' },
        { status: 400 }
      )
    }

    const existingAbogado = await prisma.abogado.findFirst({
      where: {
        id,
        officeId: user.officeId,
      },
    })

    if (!existingAbogado) {
      return NextResponse.json(
        { ok: false, message: 'Abogado no encontrado o no pertenece a tu oficina', error: 'Abogado no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    await prisma.abogado.delete({
      where: { id },
    })

    return NextResponse.json({ ok: true, message: 'Abogado eliminado correctamente' })
  } catch (error) {
    console.error('Error deleting abogado:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al eliminar el abogado'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}
