import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { recordCriticalEvent } from '@/lib/audit/activityEvent'
import { ApiError, apiFailure } from '@/lib/api/server'
import { assertRoleWorkflowWritable, syncDiligenceWorkflowState } from '@/lib/roles/workflowState'

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
          select: { id: true, estado: true },
        },
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    assertRoleWorkflowWritable(diligencia.rol.estado)

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
        data: { fecha: data.fechaRealizacion ? new Date(data.fechaRealizacion) : diligencia.fecha, meta: metaToPersist },
        include: { tipo: true },
      })
      const derivedStatus = await syncDiligenceWorkflowState(diligencia.id, tx)
      if (derivedStatus !== 'completada') {
        throw new ApiError(
          'VALIDATION_ERROR',
          'La diligencia aún tiene notificaciones sin recibo o estampo vigente.',
          400
        )
      }
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
    if (error instanceof ApiError) return apiFailure(error)
    console.error('Error completando diligencia:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al completar la diligencia' },
      { status: 500 }
    )
  }

  })
}

