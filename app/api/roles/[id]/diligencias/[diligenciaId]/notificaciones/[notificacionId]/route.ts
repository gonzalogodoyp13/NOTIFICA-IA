import { NextRequest, NextResponse } from 'next/server'

import { Prisma } from '@prisma/client'

import { recordCriticalEvent } from '@/lib/audit/activityEvent'
import { ApiError, apiFailure, handleApiError, withApiUser } from '@/lib/api/server'
import { deletePdfFromDocumentStorage } from '@/lib/documents/storage'
import { prisma } from '@/lib/prisma'
import { asJsonObject } from '@/lib/utils/json'

export const dynamic = 'force-dynamic'

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
      select: {
        id: true,
        diligenciaId: true,
        meta: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!existing) {
      return apiFailure(new ApiError('NOT_FOUND', 'Notificacion no encontrada o no pertenece a esta diligencia', 404))
    }

    const body = await req.json().catch(() => null)
    const incomingMeta = asJsonObject(body)?.meta ?? null

    if (!incomingMeta || typeof incomingMeta !== 'object' || Array.isArray(incomingMeta)) {
      return apiFailure(new ApiError('VALIDATION_ERROR', 'meta debe ser un objeto', 400))
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
          updatedAt: new Date(),
        },
        select: {
          id: true,
          diligenciaId: true,
          ejecutadoId: true,
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
          changedFields: Object.keys(incomingMeta).slice(0, 100),
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
        meta: updated.meta,
        createdAt: updated.createdAt ? updated.createdAt.toISOString() : null,
        updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : null,
        step1Done: !!responseMeta.fechaEjecucion,
      },
    })
  } catch (error) {
    return handleApiError(error, { operation: 'notification.update', request: req })
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
