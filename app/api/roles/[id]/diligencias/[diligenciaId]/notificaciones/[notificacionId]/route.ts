import { NextRequest, NextResponse } from 'next/server'

import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { recordCriticalEvent } from '@/lib/audit/activityEvent'
import { ApiError, apiFailure, handleApiError, withApiUser } from '@/lib/api/server'
import { deletePdfFromDocumentStorage } from '@/lib/documents/storage'
import { prisma } from '@/lib/prisma'
import { asJsonObject } from '@/lib/utils/json'

export const dynamic = 'force-dynamic'

const NotificationProgressSchema = z.object({
  meta: z.record(z.unknown()),
  bancoId: z.number().int().positive().optional(),
})

function hasExecutionDate(meta: Record<string, unknown>) {
  if (typeof meta.fechaEjecucion === 'string' && meta.fechaEjecucion.trim()) return true
  const ejecucion = asJsonObject(meta.ejecucion)
  return typeof ejecucion?.fecha === 'string' && ejecucion.fecha.trim().length > 0
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: { id: string; diligenciaId: string; notificacionId: string } }
) {
  return withApiUser(req, 'notification.update', async user => {
   try {

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
      select: { id: true, demanda: { select: { abogadoId: true } } },
    })

    if (!rol) {
      return apiFailure(new ApiError('NOT_FOUND', 'Rol no encontrado o no pertenece a tu oficina', 404))
    }

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.diligenciaId,
        rolId: rol.id,
      },
      select: { id: true },
    })

    if (!diligencia) {
      return apiFailure(new ApiError('NOT_FOUND', 'Diligencia no encontrada o no pertenece a este ROL', 404))
    }

    const existing = await prisma.notificacion.findFirst({
      where: {
        id: params.notificacionId,
        diligenciaId: diligencia.id,
      },
      select: {
        id: true,
        diligenciaId: true,
        bancoId: true,
        meta: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!existing) {
      return apiFailure(new ApiError('NOT_FOUND', 'Notificacion no encontrada o no pertenece a esta diligencia', 404))
    }

    const parsedBody = NotificationProgressSchema.safeParse(await req.json().catch(() => null))
    if (!parsedBody.success) {
      return apiFailure(new ApiError('VALIDATION_ERROR', 'meta debe ser un objeto y bancoId debe ser valido', 400))
    }
    const { meta: incomingMeta, bancoId } = parsedBody.data

    if (bancoId !== undefined) {
      const abogadoId = rol.demanda?.abogadoId
      const allowedBank = abogadoId
        ? await prisma.abogadoBanco.findFirst({
            where: { officeId: user.officeId, abogadoId, bancoId },
            select: { id: true },
          })
        : null
      if (!allowedBank) {
        return apiFailure(new ApiError('VALIDATION_ERROR', 'El banco no pertenece al abogado de la demanda', 400))
      }
    }

    const currentMeta = existing.meta
    const base =
      currentMeta && typeof currentMeta === 'object' && !Array.isArray(currentMeta)
        ? (currentMeta as Record<string, unknown>)
        : {}

    const nextMeta = {
      ...base,
      ...(incomingMeta as Record<string, unknown>),
    }

    const updated = await prisma.$transaction(async tx => {
      const result = await tx.notificacion.update({
        where: { id: existing.id },
        data: {
          meta:
            Object.keys(nextMeta).length > 0
              ? (nextMeta as Prisma.JsonObject)
              : Prisma.JsonNull,
          ...(bancoId !== undefined ? { bancoId } : {}),
          updatedAt: new Date(),
        },
        select: {
          id: true,
          diligenciaId: true,
          ejecutadoId: true,
          bancoId: true,
          meta: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      await recordCriticalEvent(tx, user, {
        eventType: 'notification.updated',
        module: 'notificaciones',
        result: 'success',
        recordType: 'Notificacion',
        recordId: result.id,
        rolId: rol.id,
        description: 'Notificacion actualizada.',
        metadata: {
          notificationId: result.id,
          diligenceId: result.diligenciaId,
          changedFields: [
            ...Object.keys(incomingMeta),
            ...(bancoId !== undefined && bancoId !== existing.bancoId ? ['bancoId'] : []),
          ].slice(0, 100),
        },
      })
      return result
    })

    const responseMeta =
      updated.meta && typeof updated.meta === 'object' && !Array.isArray(updated.meta)
        ? (updated.meta as Record<string, unknown>)
        : {}

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        diligenciaId: updated.diligenciaId,
        ejecutadoId: updated.ejecutadoId,
        bancoId: updated.bancoId,
        meta: updated.meta,
        createdAt: updated.createdAt ? updated.createdAt.toISOString() : null,
        updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : null,
        step1Done: hasExecutionDate(responseMeta),
      },
    })
  } catch (error) {
    return handleApiError(error, { operation: 'notification.update', request: req, user })
  }
  })
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: { id: string; diligenciaId: string; notificacionId: string } }
) {
  return withApiUser(req, 'notification.delete', async user => {
   try {

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
      select: { id: true },
    })

    if (!rol) {
      return apiFailure(new ApiError('NOT_FOUND', 'Rol no encontrado o no pertenece a tu oficina', 404))
    }

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.diligenciaId,
        rolId: rol.id,
      },
      select: { id: true },
    })

    if (!diligencia) {
      return apiFailure(new ApiError('NOT_FOUND', 'Diligencia no encontrada o no pertenece a este ROL', 404))
    }

    const existing = await prisma.notificacion.findFirst({
      where: {
        id: params.notificacionId,
        diligenciaId: diligencia.id,
      },
      select: { id: true },
    })

    if (!existing) {
      return apiFailure(new ApiError('NOT_FOUND', 'Notificacion no encontrada o no pertenece a esta diligencia', 404))
    }

    await req.json().catch(() => null)

    const documentos = await prisma.documento.findMany({
      where: { notificacionId: params.notificacionId },
      include: {
        versions: {
          where: { deletedAt: null },
          select: {
            storageBucket: true,
            storageKey: true,
          },
        },
      },
    })

    for (const documento of documentos) {
      for (const version of documento.versions) {
        await deletePdfFromDocumentStorage(version.storageBucket, version.storageKey)
      }
    }

    await prisma.$transaction(async tx => {
      const receipts = await tx.recibo.deleteMany({
        where: { notificacionId: params.notificacionId },
      })

      const documents = await tx.documento.deleteMany({
        where: { notificacionId: params.notificacionId },
      })

      await tx.notificacion.delete({
        where: { id: params.notificacionId },
      })
      await recordCriticalEvent(tx, user, {
        eventType: 'notification.deleted',
        module: 'notificaciones',
        result: 'success',
        recordType: 'Notificacion',
        recordId: params.notificacionId,
        rolId: rol.id,
        description: 'Notificacion eliminada.',
        metadata: {
          notificationId: params.notificacionId,
          diligenceId: diligencia.id,
          deletedDocumentCount: documents.count,
          deletedReceiptCount: receipts.count,
        },
      })
    })

    return NextResponse.json({ ok: true, mode: 'DELETED' })
  } catch (error) {
    return handleApiError(error, { operation: 'notification.delete', request: req })
  }
  })
}
