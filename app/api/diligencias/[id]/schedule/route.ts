import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { DiligenciaScheduleSchema } from '@/lib/validations/rol-workspace'
import { recordCriticalEvent } from '@/lib/audit/activityEvent'

export const dynamic = 'force-dynamic'

type RoleStateDb = Pick<Prisma.TransactionClient, 'rolCausa'>
async function syncRolEstado(rolId: string, db: RoleStateDb = prisma) {
  const rol = await db.rolCausa.findUnique({
    where: { id: rolId },
    select: {
      estado: true,
      diligencias: {
        select: { estado: true },
      },
    },
  })

  if (!rol || rol.estado === 'archivado') {
    return
  }

  const total = rol.diligencias.length
  const completadas = rol.diligencias.filter(d => d.estado === 'completada').length

  let nextEstado: 'pendiente' | 'en_proceso' | 'terminado' = rol.estado

  if (total === 0) {
    nextEstado = 'pendiente'
  } else if (completadas === total) {
    nextEstado = 'terminado'
  } else {
    nextEstado = 'en_proceso'
  }

  if (nextEstado !== rol.estado) {
    await db.rolCausa.update({
      where: { id: rolId },
      data: { estado: nextEstado },
    })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'put.diligencias.id.schedule', async user => {
  try {

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: user.officeId,
        },
      },
      include: {
        rol: {
          select: {
            id: true,
            demandaId: true,
          },
        },
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const parsed = DiligenciaScheduleSchema.safeParse(await req.json())

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const data = parsed.data

    const ejecutadoIds: string[] = []
    if (data.ejecutadoId) {
      ejecutadoIds.push(data.ejecutadoId)
    }
    if (data.direccionId) {
      ejecutadoIds.push(data.direccionId)
    }

    if (ejecutadoIds.length > 0 && diligencia.rol.demandaId) {
      const unique = Array.from(new Set(ejecutadoIds))
      const validCount = await prisma.ejecutado.count({
        where: {
          id: { in: unique },
          demandaId: diligencia.rol.demandaId,
        },
      })

      if (validCount !== unique.length) {
        return NextResponse.json(
          { ok: false, error: 'Ejecutado o dirección no pertenecen al ROL' },
          { status: 400 }
        )
      }
    }

    const metaActual = (diligencia.meta ?? {}) as Record<string, unknown>
    const mergedMeta: Record<string, unknown> = {
      ...metaActual,
      fechaEjecucion: data.fechaEjecucion,
    }

    if (data.horaEjecucion) {
      mergedMeta.horaEjecucion = data.horaEjecucion
    }
    if (data.ejecutadoId) {
      mergedMeta.ejecutadoId = data.ejecutadoId
    }
    if (data.direccionId) {
      mergedMeta.direccionId = data.direccionId
    }
    if (data.observaciones) {
      mergedMeta.observaciones = data.observaciones
    }

    mergedMeta.programadoEn = new Date().toISOString()

    const metaToPersist =
      Object.keys(mergedMeta).length > 0 ? (mergedMeta as Prisma.JsonObject) : undefined

    const updated = await prisma.$transaction(async tx => {
      const result = await tx.diligencia.update({
        where: { id: diligencia.id },
        data: { fecha: new Date(data.fechaEjecucion), meta: metaToPersist },
      })
      await syncRolEstado(diligencia.rol.id, tx)
      await recordCriticalEvent(tx, user, {
        eventType: 'diligence.scheduled', module: 'diligencias', result: 'success',
        recordType: 'Diligencia', recordId: result.id, rolId: diligencia.rol.id,
        description: 'Diligencia programada.',
        metadata: { diligenceId: result.id, legalDate: data.fechaEjecucion, changedFields: ['fecha'] },
      })
      return result
    })

    return NextResponse.json({ ok: true, data: updated })
  } catch (error) {
    console.error('Error programando diligencia:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al programar la diligencia' },
      { status: 500 }
    )
  }

  })
}

