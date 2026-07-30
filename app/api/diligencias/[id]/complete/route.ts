import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { recordCriticalEvent } from '@/lib/audit/activityEvent'

export const dynamic = 'force-dynamic'

const CompleteSchema = z.object({
  observaciones: z.string().max(1000).optional(),
  fechaRealizacion: z
    .string()
    .optional()
    .refine(
      value => {
        if (!value) return true
        return !Number.isNaN(Date.parse(value))
      },
      { message: 'Fecha inválida' }
    ),
})

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
  return withApiUser(req, 'put.diligencias.id.complete', async user => {
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
          select: { id: true },
        },
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const parsed = CompleteSchema.safeParse(await req.json())

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const data = parsed.data

    const metaActual = (diligencia.meta ?? {}) as Record<string, unknown>
    const mergedMeta: Record<string, unknown> = {
      ...metaActual,
      completadaEn: new Date().toISOString(),
    }

    if (data.observaciones) {
      mergedMeta.observacionesFinales = data.observaciones
    }

    if (data.fechaRealizacion) {
      mergedMeta.fechaRealizacion = data.fechaRealizacion
    }

    const metaToPersist =
      Object.keys(mergedMeta).length > 0 ? (mergedMeta as Prisma.JsonObject) : undefined

    const updated = await prisma.$transaction(async tx => {
      const result = await tx.diligencia.update({
        where: { id: diligencia.id },
        data: { estado: 'completada', fecha: data.fechaRealizacion ? new Date(data.fechaRealizacion) : diligencia.fecha, meta: metaToPersist },
        include: { tipo: true },
      })
      await syncRolEstado(diligencia.rol.id, tx)
      await recordCriticalEvent(tx, user, {
        eventType: 'diligence.completed', module: 'diligencias', result: 'success',
        recordType: 'Diligencia', recordId: result.id, rolId: diligencia.rol.id,
        description: 'Diligencia completada.',
        metadata: { diligenceId: result.id, previousStatus: diligencia.estado, nextStatus: 'completada', legalDate: data.fechaRealizacion ?? null },
      })
      return result
    })

    return NextResponse.json({ ok: true, data: updated })
  } catch (error) {
    console.error('Error completando diligencia:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al completar la diligencia' },
      { status: 500 }
    )
  }

  })
}

