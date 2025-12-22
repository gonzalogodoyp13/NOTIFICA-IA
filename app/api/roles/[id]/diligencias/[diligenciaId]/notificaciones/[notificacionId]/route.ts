import { NextRequest, NextResponse } from 'next/server'

import { Prisma } from '@prisma/client'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: { id: string; diligenciaId: string; notificacionId: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
      select: { id: true },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.diligenciaId,
        rolId: rol.id,
      },
      select: { id: true },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a este ROL' },
        { status: 404 }
      )
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
      return NextResponse.json(
        { ok: false, error: 'Notificación no encontrada o no pertenece a esta diligencia' },
        { status: 404 }
      )
    }

    const body = await req.json().catch(() => null)
    const incomingMeta =
      body && typeof body === 'object' && !Array.isArray(body) ? (body as any).meta : null

    if (!incomingMeta || typeof incomingMeta !== 'object' || Array.isArray(incomingMeta)) {
      return NextResponse.json({ ok: false, error: 'meta debe ser un objeto' }, { status: 400 })
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

    const updated = await prisma.notificacion.update({
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
        meta: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        diligenciaId: updated.diligenciaId,
        meta: updated.meta,
        createdAt: updated.createdAt ? updated.createdAt.toISOString() : null,
        updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : null,
      },
    })
  } catch (error) {
    console.error('Error actualizando meta de notificación:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al actualizar la notificación' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: { id: string; diligenciaId: string; notificacionId: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
      select: { id: true },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.diligenciaId,
        rolId: rol.id,
      },
      select: { id: true },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a este ROL' },
        { status: 404 }
      )
    }

    const existing = await prisma.notificacion.findFirst({
      where: {
        id: params.notificacionId,
        diligenciaId: diligencia.id,
      },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'Notificación no encontrada o no pertenece a esta diligencia' },
        { status: 404 }
      )
    }

    // Obtener body opcional con razón
    const body = await req.json().catch(() => null)
    const reason = (body && typeof body === 'object' && !Array.isArray(body) && typeof (body as any).reason === 'string')
      ? (body as any).reason
      : 'Anulado por usuario'

    // Contar documentos asociados
    const count = await prisma.documento.count({
      where: { notificacionId: params.notificacionId } as any,
    })

    if (count > 0) {
      // CASO 1: Hay documentos → ANULAR (soft delete con cascade)
      const now = new Date()
      await prisma.$transaction(async (tx) => {
        // Anular notificación
        await tx.notificacion.update({
          where: { id: params.notificacionId },
          data: {
            voidedAt: now,
            voidReason: reason,
            voidedByUserId: user.id,
            updatedAt: now,
          } as any,
        })

        // Anular todos los documentos asociados (mismo timestamp)
        await tx.documento.updateMany({
          where: { notificacionId: params.notificacionId } as any,
          data: {
            voidedAt: now,
            voidReason: reason,
            voidedByUserId: user.id,
          } as any,
        })
      })

      return NextResponse.json({ ok: true, mode: 'VOIDED' })
    } else {
      // CASO 2: No hay documentos → HARD DELETE (como antes)
      await prisma.notificacion.delete({ where: { id: params.notificacionId } })
      return NextResponse.json({ ok: true, mode: 'DELETED' })
    }
  } catch (error) {
    console.error('Error eliminando notificación:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al eliminar la notificación' },
      { status: 500 }
    )
  }
}
