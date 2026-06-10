import { NextRequest, NextResponse } from 'next/server'

import { Prisma } from '@prisma/client'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { deletePdfFromDocumentStorage } from '@/lib/documents/storage'
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
        { ok: false, error: 'Notificacion no encontrada o no pertenece a esta diligencia' },
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
        ejecutadoId: true,
        meta: true,
        createdAt: true,
        updatedAt: true,
      },
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
    console.error('Error actualizando meta de notificacion:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al actualizar la notificacion' },
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
        { ok: false, error: 'Notificacion no encontrada o no pertenece a esta diligencia' },
        { status: 404 }
      )
    }

    await req.json().catch(() => null)

    const documentos = await prisma.documento.findMany({
      where: { notificacionId: params.notificacionId } as any,
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
      await tx.recibo.deleteMany({
        where: { notificacionId: params.notificacionId },
      })

      await tx.documento.deleteMany({
        where: { notificacionId: params.notificacionId } as any,
      })

      await tx.notificacion.delete({
        where: { id: params.notificacionId },
      })
    })

    return NextResponse.json({ ok: true, mode: 'DELETED' })
  } catch (error) {
    console.error('Error eliminando notificacion:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al eliminar la notificacion' },
      { status: 500 }
    )
  }
}
