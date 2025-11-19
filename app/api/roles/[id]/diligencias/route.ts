import { NextRequest, NextResponse } from 'next/server'

import { Prisma } from '@prisma/client'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { DiligenciaCreateSchema } from '@/lib/validations/rol-workspace'

export const dynamic = 'force-dynamic'

async function syncRolEstado(rolId: string) {
  const rol = await prisma.rolCausa.findUnique({
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
    await prisma.rolCausa.update({
      where: { id: rolId },
      data: { estado: nextEstado },
    })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const officeIdStr = String(user.officeId)

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: officeIdStr,
      },
      select: { id: true },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const diligencias = await prisma.diligencia.findMany({
      where: { rolId: rol.id },
      include: {
        tipo: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const data = diligencias.map(d => ({
      id: d.id,
      tipo: {
        id: d.tipoId,
        nombre: d.tipo.nombre,
        descripcion: d.tipo.descripcion,
      },
      estado: d.estado,
      fecha: d.fecha.toISOString(),
      meta: d.meta,
      createdAt: d.createdAt.toISOString(),
    }))

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Error obteniendo diligencias del rol:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener las diligencias del rol' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const officeIdStr = String(user.officeId)
    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: officeIdStr,
      },
      include: {
        demanda: {
          select: {
            id: true,
          },
        },
      },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const parsed = DiligenciaCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const payload = parsed.data

    const tipo = await prisma.diligenciaTipo.findFirst({
      where: {
        id: payload.tipoId,
        officeId: officeIdStr,
      },
    })

    if (!tipo) {
      return NextResponse.json(
        { ok: false, error: 'Tipo de diligencia no encontrado en tu oficina' },
        { status: 404 }
      )
    }

    const ejecutadoIds: string[] = []

    if (payload.ejecutadoId) {
      ejecutadoIds.push(payload.ejecutadoId)
    }
    if (payload.direccionId) {
      ejecutadoIds.push(payload.direccionId)
    }

    if (ejecutadoIds.length > 0 && rol.demanda?.id) {
      const unique = Array.from(new Set(ejecutadoIds))
      const validCount = await prisma.ejecutado.count({
        where: {
          id: { in: unique },
          demandaId: rol.demanda.id,
        },
      })

      if (validCount !== unique.length) {
        return NextResponse.json(
          { ok: false, error: 'Ejecutado o dirección no pertenecen al ROL' },
          { status: 400 }
        )
      }
    }

    const metaPayload: Record<string, unknown> = {
      ...(payload.meta ?? {}),
    }

    if (payload.observaciones) {
      metaPayload.observaciones = payload.observaciones
    }
    if (payload.ejecutadoId) {
      metaPayload.ejecutadoId = payload.ejecutadoId
    }
    if (payload.direccionId) {
      metaPayload.direccionId = payload.direccionId
    }
    if (typeof payload.costo === 'number') {
      metaPayload.costo = payload.costo
    }

    const metaToPersist =
      Object.keys(metaPayload).length > 0 ? (metaPayload as Prisma.JsonObject) : undefined

    const diligencia = await prisma.diligencia.create({
      data: {
        rolId: rol.id,
        tipoId: payload.tipoId,
        fecha: new Date(payload.fecha),
        estado: 'pendiente',
        meta: metaToPersist,
      },
      include: {
        tipo: true,
      },
    })

    await syncRolEstado(rol.id)

    return NextResponse.json({ ok: true, data: diligencia })
  } catch (error) {
    console.error('Error creando diligencia:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al crear la diligencia' },
      { status: 500 }
    )
  }
}

