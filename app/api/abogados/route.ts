// API route: /api/abogados
// GET: List all abogados for the current office (with banco and procurador relations)
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
      : parsed.data.bancoId || null

    const abogado = await prisma.$transaction(async (tx) => {
      const createdAbogado = await tx.abogado.create({
        data: {
          nombre: parsed.data.nombre,
          telefono: parsed.data.telefono,
          email: parsed.data.email,
          bancoId: primaryBancoId,
          officeId: user.officeId,
        },
      })

      if (parsed.data.bancoIds && parsed.data.bancoIds.length > 0) {
        await tx.abogadoBanco.createMany({
          data: parsed.data.bancoIds.map((bancoId) => ({
            officeId: user.officeId,
            abogadoId: createdAbogado.id,
            bancoId,
          })),
          skipDuplicates: true,
        })
      }

      if (selectedExistingProcuradores.length > 0) {
        await tx.procurador.updateMany({
          where: {
            id: { in: selectedExistingProcuradores.map((procurador) => procurador.id) },
            officeId: user.officeId,
          },
          data: {
            abogadoId: createdAbogado.id,
          },
        })
      }

      const createdProcuradores = parsed.data.newProcuradores?.length
        ? await Promise.all(
            parsed.data.newProcuradores.map((procurador) =>
              tx.procurador.create({
                data: {
                  officeId: user.officeId,
                  abogadoId: createdAbogado.id,
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

      const procuradorIdsToLink = [
        ...selectedExistingProcuradores.map((procurador) => procurador.id),
        ...createdProcuradores.map((procurador) => procurador.id),
      ]

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

      return createdAbogado
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
    console.error('Error creating abogado:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el abogado'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}
