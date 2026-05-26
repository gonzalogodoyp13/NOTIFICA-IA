// API route: /api/demandas
// POST: Create a new Demanda with ejecutados (Phase 3)
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { debugLog, toSafeErrorMessage } from '@/lib/debugLog'
import { prisma } from '@/lib/prisma'
import { parseCuantiaForStorage } from '@/lib/utils/cuantia'

export const dynamic = 'force-dynamic'

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

    const { rol, tribunalId, caratula, cuantia, abogadoId, materiaId, ejecutados, procuradorId } = body

    if (!rol || !tribunalId || !caratula || !abogadoId) {
      return NextResponse.json(
        { ok: false, error: 'rol, tribunalId, caratula y abogadoId son requeridos' },
        { status: 400 }
      )
    }

    const officeId = user.officeId
    const office = await prisma.office.findUnique({
      where: { id: officeId },
    })

    if (!office) {
      return NextResponse.json(
        { ok: false, error: 'Oficina no valida para el usuario autenticado' },
        { status: 403 }
      )
    }

    const tribunalIdInt = typeof tribunalId === 'string' ? parseInt(tribunalId, 10) : tribunalId

    if (isNaN(tribunalIdInt) || !Number.isInteger(tribunalIdInt)) {
      return NextResponse.json(
        { ok: false, error: 'tribunalId debe ser un numero entero valido' },
        { status: 400 }
      )
    }

    const tribunal = await prisma.tribunales.findFirst({
      where: {
        id: tribunalIdInt,
        officeId: user.officeId,
      },
    })

    if (!tribunal) {
      return NextResponse.json(
        { ok: false, error: 'Tribunal no encontrado o no pertenece a tu oficina' },
        { status: 400 }
      )
    }

    const abogado = await prisma.abogado.findFirst({
      where: {
        id: parseInt(abogadoId),
        officeId: user.officeId,
      },
    })

    if (!abogado) {
      return NextResponse.json(
        { ok: false, error: 'Abogado no encontrado o no pertenece a tu oficina' },
        { status: 400 }
      )
    }

    if (materiaId) {
      const materia = await prisma.materia.findFirst({
        where: {
          id: parseInt(materiaId),
          officeId: user.officeId,
        },
      })

      if (!materia) {
        return NextResponse.json(
          { ok: false, error: 'Materia no encontrada o no pertenece a tu oficina' },
          { status: 400 }
        )
      }
    }

    if (procuradorId !== null && procuradorId !== undefined) {
      const procuradorIdInt = typeof procuradorId === 'string' ? parseInt(procuradorId, 10) : procuradorId

      if (isNaN(procuradorIdInt) || !Number.isInteger(procuradorIdInt)) {
        return NextResponse.json(
          { ok: false, error: 'procuradorId debe ser un numero entero valido' },
          { status: 400 }
        )
      }

      const procurador = await prisma.procurador.findFirst({
        where: {
          id: procuradorIdInt,
          officeId: user.officeId,
        },
      })

      if (!procurador) {
        return NextResponse.json(
          { ok: false, error: 'Procurador no encontrado o no pertenece a tu oficina' },
          { status: 400 }
        )
      }
    }

    const existingDemanda = await prisma.demanda.findUnique({
      where: { rol },
    })

    if (existingDemanda) {
      return NextResponse.json(
        { ok: false, error: 'El ROL ya existe' },
        { status: 400 }
      )
    }

    const findOrCreateTribunal = async (tribunalesId: number, currentOfficeId: number) => {
      const tribunalesRecord = await prisma.tribunales.findUnique({
        where: { id: tribunalesId },
      })

      if (!tribunalesRecord) {
        throw new Error('Tribunal no encontrado')
      }

      let tribunalMatch = await prisma.tribunal.findFirst({
        where: {
          nombre: tribunalesRecord.nombre,
          officeId: currentOfficeId,
        },
      })

      if (!tribunalMatch) {
        tribunalMatch = await prisma.tribunal.create({
          data: {
            nombre: tribunalesRecord.nombre,
            direccion: tribunalesRecord.direccion,
            comuna: tribunalesRecord.comuna,
            officeId: currentOfficeId,
          },
        })
      }

      return tribunalMatch
    }

    const normalizedTribunal = await findOrCreateTribunal(tribunalIdInt, officeId)

    const result = await prisma.$transaction(
      async (tx) => {
        const demanda = await tx.demanda.create({
          data: {
            rol,
            tribunalId: tribunalIdInt,
            caratula,
            cuantia: parseCuantiaForStorage(cuantia),
            abogadoId: parseInt(abogadoId),
            materiaId: materiaId ? parseInt(materiaId) : null,
            procuradorId: procuradorId ? (typeof procuradorId === 'string' ? parseInt(procuradorId, 10) : procuradorId) : null,
            officeId,
            userId: user.id,
            ejecutados: ejecutados && ejecutados.length > 0 ? {
              create: ejecutados.map((ej: any) => ({
                nombre: ej.nombre,
                rut: ej.rut,
                direccion: ej.direccion || null,
                comunaId: ej.comunaId ? parseInt(ej.comunaId) : null,
              })),
            } : undefined,
          },
          include: {
            tribunales: {
              select: {
                id: true,
                nombre: true,
              },
            },
            abogados: {
              select: {
                id: true,
                nombre: true,
              },
            },
            ejecutados: {
              include: {
                comunas: {
                  select: {
                    id: true,
                    nombre: true,
                  },
                },
              },
            },
          },
        })

        const existingRolCausa = await tx.rolCausa.findUnique({
          where: { id: demanda.id },
        })

        if (existingRolCausa) {
          await tx.rolCausa.update({
            where: { id: demanda.id },
            data: {
              demandaId: demanda.id,
              rol: demanda.rol,
              officeId: demanda.officeId,
              tribunalId: normalizedTribunal.id,
              estado: 'pendiente',
            },
          })
        } else {
          await tx.rolCausa.create({
            data: {
              id: demanda.id,
              demandaId: demanda.id,
              rol: demanda.rol,
              officeId: demanda.officeId,
              tribunalId: normalizedTribunal.id,
              estado: 'pendiente',
              createdAt: demanda.createdAt,
            },
          })
        }

        return demanda
      },
      {
        timeout: 15000,
      }
    )

    const demanda = result

    return NextResponse.json({
      ok: true,
      data: {
        ...demanda,
        rolId: demanda.id,
      },
    })
  } catch (error: any) {
    debugLog('[POST /api/demandas] Error creating demanda', {
      error: toSafeErrorMessage(error),
    })

    return NextResponse.json(
      { ok: false, error: error?.message || 'Error al crear la demanda' },
      { status: 500 }
    )
  }
}
