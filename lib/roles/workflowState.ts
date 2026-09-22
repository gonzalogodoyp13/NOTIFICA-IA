import 'server-only'

import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { SigningContextSchema, type SigningContext } from '@/lib/signing/core'
import { emptySigningResult, enqueueCompletedDiligence } from '@/lib/signing/automaticEnqueue'

import { ApiError } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'
import {
  deriveDiligenceWorkflowStatus,
  deriveRoleProgressStatus,
  type RoleWorkflowStatus,
} from '@/lib/roles/workflowStateCore'

type WorkflowDb = Pick<
  Prisma.TransactionClient,
  'diligencia' | 'rolCausa' | 'notificacion'
>

export function isRoleWorkflowReadOnly(status: RoleWorkflowStatus | string) {
  return status === 'terminado' || status === 'archivado'
}

export function assertRoleWorkflowWritable(status: RoleWorkflowStatus | string) {
  if (isRoleWorkflowReadOnly(status)) {
    throw new ApiError(
      'ROLE_READ_ONLY',
      `El ROL está ${status === 'terminado' ? 'terminado' : 'archivado'} y sus diligencias son de solo lectura.`,
      409
    )
  }
}

export async function syncRoleProgressState(rolId: string, db: WorkflowDb = prisma) {
  const rol = await db.rolCausa.findUnique({
    where: { id: rolId },
    select: { estado: true, _count: { select: { diligencias: true } } },
  })

  if (!rol || isRoleWorkflowReadOnly(rol.estado)) return rol?.estado ?? null

  const nextStatus = deriveRoleProgressStatus(rol.estado, rol._count.diligencias)
  if (rol.estado !== nextStatus) {
    await db.rolCausa.update({ where: { id: rolId }, data: { estado: nextStatus } })
  }
  return nextStatus
}

export async function syncDiligenceWorkflowState(
  diligenciaId: string,
  db: Prisma.TransactionClient,
  context: SigningContext
) {
  SigningContextSchema.parse(context)
  const diligence = await db.diligencia.findFirst({
    where: { id: diligenciaId, rol: { officeId: context.officeId } },
    select: {
      id: true,
      rolId: true,
      estado: true,
      meta: true,
      rol: { select: { estado: true } },
      notificaciones: {
        where: { voidedAt: null },
        select: {
          documentos: {
            where: {
              voidedAt: null,
              officeId: context.officeId,
              tipo: { in: ['Recibo', 'Estampo'] },
              OR: [
                { pdfId: { not: null } },
                { currentVersion: { is: { deletedAt: null } } },
              ],
            },
            select: { tipo: true },
          },
        },
      },
    },
  })

  if (!diligence) throw new ApiError('NOT_FOUND', 'Diligencia no encontrada.', 404)
  assertRoleWorkflowWritable(diligence.rol.estado)

  const nextStatus = deriveDiligenceWorkflowStatus({
    currentStatus: diligence.estado,
    activeNotificationDocumentTypes: diligence.notificaciones.map(notification =>
      notification.documentos.map(document => document.tipo)
    ),
  })

  let signing = emptySigningResult('NOT_COMPLETED')
  if (nextStatus === 'completada') {
    const meta = diligence.meta && typeof diligence.meta === 'object' && !Array.isArray(diligence.meta)
      ? diligence.meta as Prisma.JsonObject : {}
    const completionEventId = diligence.estado === 'completada' && typeof meta.signingCompletionEventId === 'string'
      ? meta.signingCompletionEventId : randomUUID()
    if (nextStatus !== diligence.estado || completionEventId !== meta.signingCompletionEventId) {
      await db.diligencia.update({ where: { id: diligence.id }, data: {
        estado: nextStatus, meta: { ...meta, signingCompletionEventId: completionEventId, completadaEn: new Date().toISOString() },
      } })
    }
    signing = await enqueueCompletedDiligence(db, context, diligence, completionEventId)
  } else if (nextStatus !== diligence.estado) {
    await db.diligencia.update({
      where: { id: diligence.id },
      data: { estado: nextStatus },
    })
  }

  await syncRoleProgressState(diligence.rolId, db)
  return { status: nextStatus, signing }
}
