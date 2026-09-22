import { withApiUser, ApiError, apiFailure } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordCriticalEvent } from '@/lib/audit/activityEvent'
import { assertRoleWorkflowWritable, syncDiligenceWorkflowState } from '@/lib/roles/workflowState'
import { workflowTransaction } from '@/lib/signing/transaction'

export const dynamic = 'force-dynamic'
const CompleteSchema = z.object({
  observaciones: z.string().max(1000).optional(),
  fechaRealizacion: z.string().optional().refine(value => !value || !Number.isNaN(Date.parse(value)), { message: 'Fecha inválida' }),
})

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiUser(req, 'put.diligencias.id.complete', async user => {
    try {
      const parsed = CompleteSchema.safeParse(await req.json())
      if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
      const data = parsed.data
      const context = { officeId: user.officeId, userId: user.id }
      const completed = await workflowTransaction(prisma, context, async tx => {
        const diligence = await tx.diligencia.findFirst({
          where: { id: params.id, rol: { officeId: user.officeId } },
          include: { rol: { select: { id: true, estado: true } } },
        })
        if (!diligence) throw new ApiError('NOT_FOUND', 'Diligencia no encontrada o no pertenece a tu oficina', 404)
        assertRoleWorkflowWritable(diligence.rol.estado)
        const meta = diligence.meta && typeof diligence.meta === 'object' && !Array.isArray(diligence.meta)
          ? diligence.meta as Prisma.JsonObject : {}
        await tx.diligencia.update({ where: { id: diligence.id }, data: {
          fecha: data.fechaRealizacion ? new Date(data.fechaRealizacion) : diligence.fecha,
          meta: { ...meta, ...(data.observaciones ? { observacionesFinales: data.observaciones } : {}),
            ...(data.fechaRealizacion ? { fechaRealizacion: data.fechaRealizacion } : {}) },
        } })
        const workflow = await syncDiligenceWorkflowState(diligence.id, tx, context)
        if (workflow.status !== 'completada') throw new ApiError('VALIDATION_ERROR',
          'La diligencia aún tiene notificaciones sin recibo o estampo vigente.', 400)
        await recordCriticalEvent(tx, user, {
          eventType: 'diligence.completed', module: 'diligencias', result: 'success',
          recordType: 'Diligencia', recordId: diligence.id, rolId: diligence.rol.id,
          description: 'Diligencia completada.',
          metadata: { diligenceId: diligence.id, previousStatus: diligence.estado, nextStatus: 'completada', legalDate: data.fechaRealizacion ?? null },
        })
        // Read after derivation to return the committed status and event identity.
        const updated = await tx.diligencia.findUniqueOrThrow({ where: { id: diligence.id }, include: { tipo: true } })
        return { updated, signing: workflow.signing }
      })
      return NextResponse.json({ ok: true, data: completed.updated, signing: completed.signing })
    } catch (error) {
      if (error instanceof ApiError) return apiFailure(error)
      console.error('Error completando diligencia:', error)
      return NextResponse.json({ ok: false, error: 'Error al completar la diligencia' }, { status: 500 })
    }
  })
}
