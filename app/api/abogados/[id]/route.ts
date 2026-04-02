// API route: /api/abogados/[id]
// PUT: Update an abogado
// DELETE: Delete an abogado
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
        { ok: false, message: 'ID invalido', error: 'ID invalido' },
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

    const bancoIds = parsed.data.bancoIds ?? []
    const procuradorIds = parsed.data.procuradorIds ?? []

    if (bancoIds.length > 0) {
      const bancos = await prisma.banco.findMany({
        where: {
          id: { in: bancoIds },
          officeId: user.officeId,
        },
        select: { id: true },
      })

      if (bancos.length !== bancoIds.length) {
        return NextResponse.json(
          { ok: false, message: 'Uno o mas bancos no encontrados o no pertenecen a tu oficina', error: 'Bancos invalidos' },
          { status: 400 }
        )
      }
    }

    if (procuradorIds.length > 0) {
      const procuradores = await prisma.procurador.findMany({
        where: {
          id: { in: procuradorIds },
          officeId: user.officeId,
        },
        select: { id: true },
      })

      if (procuradores.length !== procuradorIds.length) {
        return NextResponse.json(
          { ok: false, message: 'Uno o mas procuradores no encontrados o no pertenecen a tu oficina', error: 'Procuradores invalidos' },
          { status: 400 }
        )
      }
    }

    const abogado = await prisma.$transaction(async (tx) => {
      await tx.abogado.update({
        where: { id },
        data: {
          nombre: parsed.data.nombre,
          telefono: parsed.data.telefono,
          email: parsed.data.email,
        },
      })

      await tx.abogadoBanco.deleteMany({
        where: {
          abogadoId: id,
          officeId: user.officeId,
        },
      })

      if (bancoIds.length > 0) {
        await tx.abogadoBanco.createMany({
          data: bancoIds.map((bancoId) => ({
            officeId: user.officeId,
            abogadoId: id,
            bancoId,
          })),
          skipDuplicates: true,
        })
      }

      const shouldSyncProcuradores =
        parsed.data.procuradorIds !== undefined || parsed.data.newProcuradores !== undefined

      if (shouldSyncProcuradores) {
        await tx.procuradorAbogado.deleteMany({
          where: {
            officeId: user.officeId,
            abogadoId: id,
          },
        })

        if (procuradorIds.length > 0) {
          await tx.procuradorAbogado.createMany({
            data: procuradorIds.map((procuradorId) => ({
              officeId: user.officeId,
              abogadoId: id,
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
              abogadoId: id,
              procuradorId: procurador.id,
            })),
            skipDuplicates: true,
          })
        }
      }

      return tx.abogado.findUniqueOrThrow({
        where: { id },
        include: abogadoInclude,
      })
    })

    return NextResponse.json({ ok: true, data: mapAbogado(abogado) })
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
        { ok: false, message: 'ID invalido', error: 'ID invalido' },
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
