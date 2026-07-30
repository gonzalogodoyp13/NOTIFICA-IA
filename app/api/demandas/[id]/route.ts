import { withApiUser } from '@/lib/api/server'
// API route: /api/demandas/[id]
// PUT: Update an existing Demanda and synchronize RolCausa.rol if ROL changed
// Validates user, officeId, and ensures ROL uniqueness per office
import { NextRequest, NextResponse } from 'next/server'
import { debugLog, toSafeErrorMessage } from '@/lib/debugLog'
import { prisma } from '@/lib/prisma'
import { parseCuantiaForStorage } from '@/lib/utils/cuantia'
import { recordCriticalEvent } from '@/lib/audit/activityEvent'

export const dynamic = 'force-dynamic'

function normalizeRol(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

class DemandaUpdateValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'DemandaUpdateValidationError'
    this.status = status
  }
}

type IncomingEjecutado = {
  id: string | null
  nombre: string
  rut: string
  direccion: string | null
  comunaId: number | null
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'put.demandas.id', async user => {
  try {

    const body = await req.json()

    const { rol, tribunalId, caratula, cuantia, abogadoId, materiaId, ejecutados, procuradorId } = body
    const normalizedRol = normalizeRol(rol)

    if (!normalizedRol || !tribunalId || !caratula) {
      return NextResponse.json(
        { ok: false, error: 'rol, tribunalId y caratula son requeridos' },
        { status: 400 }
      )
    }

    const demanda = await prisma.demanda.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
    })

    if (!demanda) {
      return NextResponse.json(
        { ok: false, error: 'Demanda no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const tribunalIdValue = typeof tribunalId === 'string' ? tribunalId.trim() : ''
    const tribunal = await prisma.tribunal.findFirst({
      where: {
        id: tribunalIdValue,
        officeId: user.officeId,
      },
    })

    if (!tribunal) {
      return NextResponse.json(
        { ok: false, error: 'Tribunal no encontrado o no pertenece a tu oficina' },
        { status: 400 }
      )
    }

    const abogadoIdInt =
      abogadoId === null || abogadoId === undefined || abogadoId === ''
        ? null
        : typeof abogadoId === 'string'
          ? parseInt(abogadoId, 10)
          : abogadoId

    if (abogadoIdInt !== null) {
      const abogado = await prisma.abogado.findFirst({
        where: {
          id: abogadoIdInt,
          officeId: user.officeId,
        },
      })

      if (!abogado) {
        return NextResponse.json(
          { ok: false, error: 'Abogado no encontrado o no pertenece a tu oficina' },
          { status: 400 }
        )
      }
    }

    const materiaIdInt =
      materiaId === null || materiaId === undefined || materiaId === ''
        ? null
        : typeof materiaId === 'string'
          ? parseInt(materiaId, 10)
          : materiaId

    if (materiaIdInt !== null) {
      const materia = await prisma.materia.findFirst({
        where: {
          id: materiaIdInt,
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

    const procuradorIdInt =
      procuradorId === null || procuradorId === undefined || procuradorId === ''
        ? null
        : typeof procuradorId === 'string'
          ? parseInt(procuradorId, 10)
          : procuradorId

    if (procuradorIdInt !== null) {
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

    const normalizedEjecutados: IncomingEjecutado[] | undefined = Array.isArray(ejecutados)
      ? ejecutados.map((ej: any) => ({
          id: typeof ej.id === 'string' && ej.id.trim() ? ej.id.trim() : null,
          nombre: ej.nombre,
          rut: ej.rut,
          direccion: typeof ej.direccion === 'string' && ej.direccion.trim() ? ej.direccion.trim() : null,
          comunaId:
            ej.comunaId === null || ej.comunaId === undefined || ej.comunaId === ''
              ? null
              : typeof ej.comunaId === 'string'
                ? parseInt(ej.comunaId, 10)
                : ej.comunaId,
        }))
      : undefined

    if (ejecutados !== undefined) {
      if (!normalizedEjecutados) {
        return NextResponse.json(
          { ok: false, error: 'ejecutados debe ser un array' },
          { status: 400 }
        )
      }

      const seenEjecutadoIds = new Set<string>()

      for (const ej of normalizedEjecutados) {
        if (!ej.nombre || !ej.rut) {
          return NextResponse.json(
            { ok: false, error: 'Cada ejecutado debe tener nombre y rut' },
            { status: 400 }
          )
        }

        if (ej.id) {
          if (seenEjecutadoIds.has(ej.id)) {
            return NextResponse.json(
              { ok: false, error: 'No se pueden repetir ejecutados existentes en la misma actualizacion' },
              { status: 400 }
            )
          }
          seenEjecutadoIds.add(ej.id)
        }

        if (ej.comunaId !== null) {
          if (isNaN(ej.comunaId) || !Number.isInteger(ej.comunaId)) {
            return NextResponse.json(
              { ok: false, error: 'comunaId debe ser un numero entero valido' },
              { status: 400 }
            )
          }

          const comuna = await prisma.comuna.findFirst({
            where: {
              id: ej.comunaId,
              officeId: user.officeId,
            },
          })

          if (!comuna) {
            return NextResponse.json(
              { ok: false, error: `Comuna con ID ${ej.comunaId} no encontrada o no pertenece a tu oficina` },
              { status: 400 }
            )
          }
        }
      }
    }

    const rolChanged = demanda.rol !== normalizedRol

    if (rolChanged) {
      const existingDemanda = await prisma.demanda.findFirst({
        where: {
          rol: normalizedRol,
          officeId: user.officeId,
          id: { not: params.id },
        },
      })

      if (existingDemanda) {
        return NextResponse.json(
          { ok: false, error: `Ya existe una causa con el ROL ${normalizedRol} en esta oficina.` },
          { status: 400 }
        )
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedDemanda = await tx.demanda.update({
        where: { id: params.id },
        data: {
          rol: normalizedRol,
          caratula,
          cuantia:
            cuantia !== undefined && cuantia !== null
              ? parseCuantiaForStorage(cuantia)
              : demanda.cuantia,
          abogadoId: abogadoIdInt !== null ? abogadoIdInt : demanda.abogadoId,
          materiaId: materiaIdInt,
          procuradorId:
            procuradorId !== undefined
              ? procuradorIdInt
              : demanda.procuradorId,
        },
        include: {
          abogados: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
      })

      if (normalizedEjecutados !== undefined) {
        const existingEjecutados = await tx.ejecutado.findMany({
          where: { demandaId: params.id },
          select: {
            id: true,
            nombre: true,
          },
        })

        const existingIds = new Set(existingEjecutados.map((ej) => ej.id))
        const incomingExisting = normalizedEjecutados.filter((ej) => !!ej.id)
        const incomingNew = normalizedEjecutados.filter((ej) => !ej.id)

        for (const ej of incomingExisting) {
          if (!existingIds.has(ej.id!)) {
            throw new DemandaUpdateValidationError(
              'Uno de los ejecutados enviados no pertenece a esta demanda'
            )
          }
        }

        const incomingIds = new Set(incomingExisting.map((ej) => ej.id!))
        const removedIds = existingEjecutados
          .map((ej) => ej.id)
          .filter((id) => !incomingIds.has(id))

        if (removedIds.length > 0) {
          const blockedEjecutados = await tx.ejecutado.findMany({
            where: {
              id: { in: removedIds },
            },
            select: {
              nombre: true,
              _count: {
                select: {
                  notificaciones: true,
                },
              },
            },
          })

          const withNotifications = blockedEjecutados.filter(
            (ej) => ej._count.notificaciones > 0
          )

          if (withNotifications.length > 0) {
            const nombres = withNotifications
              .map((ej) => ej.nombre?.trim() || 'sin nombre')
              .join(', ')

            throw new DemandaUpdateValidationError(
              `No se puede eliminar el ejecutado ${nombres} porque ya tiene notificaciones asociadas.`
            )
          }
        }

        for (const ej of incomingExisting) {
          await tx.ejecutado.update({
            where: { id: ej.id! },
            data: {
              nombre: ej.nombre,
              rut: ej.rut,
              direccion: ej.direccion,
              comunaId: ej.comunaId,
            },
          })
        }

        if (incomingNew.length > 0) {
          await tx.ejecutado.createMany({
            data: incomingNew.map((ej) => ({
              demandaId: params.id,
              nombre: ej.nombre,
              rut: ej.rut,
              direccion: ej.direccion,
              comunaId: ej.comunaId,
            })),
          })
        }

        if (removedIds.length > 0) {
          await tx.ejecutado.deleteMany({
            where: {
              id: { in: removedIds },
            },
          })
        }
      }

      const rolCausa = await tx.rolCausa.findFirst({
        where: { demandaId: params.id, officeId: user.officeId },
      })
      if (!rolCausa) {
        throw new DemandaUpdateValidationError('La demanda no tiene una causa asociada', 409)
      }
      await tx.rolCausa.update({
        where: { id: rolCausa.id },
        data: { ...(rolChanged ? { rol: normalizedRol } : {}), tribunalId: tribunal.id },
      })

      await recordCriticalEvent(tx, user, {
        eventType: 'case.updated',
        module: 'roles',
        result: 'success',
        recordType: 'Demanda',
        recordId: updatedDemanda.id,
        rolId: rolCausa.id,
        rol: normalizedRol,
        description: 'Demanda y ROL actualizados.',
        metadata: {
          demandId: updatedDemanda.id,
          rolId: rolCausa.id,
          changedFields: [
            'rol', 'tribunalId', 'caratula', 'cuantia', 'abogadoId', 'materiaId', 'procuradorId',
            ...(normalizedEjecutados !== undefined ? ['ejecutados'] : []),
          ],
          executedPartyCount: normalizedEjecutados?.length,
        },
      })

      return updatedDemanda
    })

    return NextResponse.json({
      ok: true,
      data: {
        ...result,
        rolId: result.id,
      },
    })
  } catch (error: unknown) {
    debugLog('[PUT /api/demandas/[id]] Error updating demanda', {
      error: toSafeErrorMessage(error),
    })

    if (error instanceof DemandaUpdateValidationError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Error al actualizar la demanda' },
      { status: 500 }
    )
  }

  })
}
