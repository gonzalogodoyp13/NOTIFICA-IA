import { NextRequest, NextResponse } from 'next/server'

import { Prisma } from '@prisma/client'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { DiligenciaUpdateSchema } from '@/lib/validations/rol-workspace'

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
      return NextResponse.json({ ok: false, message: 'No autorizado', error: 'No autorizado' }, { status: 401 })
    }

    const officeIdStr = String(user.officeId)

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: officeIdStr,
        },
      },
      include: {
        tipo: true,
        rol: {
          select: {
            id: true,
            estado: true,
          },
        },
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, message: 'Diligencia no encontrada o no pertenece a tu oficina', error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: diligencia })
  } catch (error) {
    console.error('Error obteniendo diligencia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener la diligencia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, message: 'No autorizado', error: 'No autorizado' }, { status: 401 })
    }

    const officeIdStr = String(user.officeId)

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: officeIdStr,
        },
      },
      include: {
        rol: {
          select: {
            id: true,
            demandaId: true,
            estado: true,
          },
        },
        tipo: true,
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, message: 'Diligencia no encontrada o no pertenece a tu oficina', error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const parsed = DiligenciaUpdateSchema.safeParse(await req.json())

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json({ ok: false, message: errorMessage, error: errorMessage }, { status: 400 })
    }

    const data = parsed.data

    if (data.tipoId) {
      const tipo = await prisma.diligenciaTipo.findFirst({
        where: {
          id: data.tipoId,
          officeId: officeIdStr,
        },
      })

      if (!tipo) {
        return NextResponse.json(
          { ok: false, message: 'Tipo de diligencia no encontrado en tu oficina', error: 'Tipo de diligencia no encontrado en tu oficina' },
          { status: 404 }
        )
      }
    }

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
          { ok: false, message: 'Ejecutado o dirección no pertenecen al ROL', error: 'Ejecutado o dirección no pertenecen al ROL' },
          { status: 400 }
        )
      }
    }

    const metaActual = (diligencia.meta ?? {}) as Record<string, unknown>
    const mergedMeta: Record<string, unknown> = {
      ...metaActual,
      ...(data.meta ?? {}),
    }

    if (typeof data.observaciones !== 'undefined') {
      if (data.observaciones === null || data.observaciones === '') {
        delete mergedMeta.observaciones
      } else {
        mergedMeta.observaciones = data.observaciones
      }
    }

    if (typeof data.ejecutadoId !== 'undefined') {
      mergedMeta.ejecutadoId = data.ejecutadoId
    }

    if (typeof data.direccionId !== 'undefined') {
      mergedMeta.direccionId = data.direccionId
    }

    if (typeof data.costo !== 'undefined') {
      mergedMeta.costo = data.costo
    }

    const updateData: Record<string, unknown> = {}

    if (data.tipoId) {
      updateData.tipoId = data.tipoId
    }
    if (data.fecha) {
      updateData.fecha = new Date(data.fecha)
    }
    if (data.estado) {
      updateData.estado = data.estado
    }

    updateData.meta =
      Object.keys(mergedMeta).length > 0 ? (mergedMeta as Prisma.JsonObject) : undefined

    const updated = await prisma.diligencia.update({
      where: { id: diligencia.id },
      data: updateData,
      include: {
        tipo: true,
      },
    })

    await syncRolEstado(diligencia.rol.id)

    await logAudit({
      userEmail: user.email,
      userId: user.id,
      officeId: officeIdStr,
      rolId: diligencia.rol.id,
      tabla: 'Diligencia',
      accion: 'Actualizó diligencia',
      diff: { diligenciaId: diligencia.id, cambios: data },
    })

    return NextResponse.json({ ok: true, data: updated })
  } catch (error) {
    console.error('Error actualizando diligencia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al actualizar la diligencia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, message: 'No autorizado', error: 'No autorizado' }, { status: 401 })
    }

    const officeIdStr = String(user.officeId)

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: officeIdStr,
        },
      },
      select: {
        id: true,
        rolId: true,
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, message: 'Diligencia no encontrada o no pertenece a tu oficina', error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    await prisma.diligencia.delete({
      where: { id: diligencia.id },
    })

    await syncRolEstado(diligencia.rolId)

    await logAudit({
      userEmail: user.email,
      userId: user.id,
      officeId: officeIdStr,
      rolId: diligencia.rolId,
      tabla: 'Diligencia',
      accion: 'Eliminó diligencia',
      diff: { diligenciaId: diligencia.id },
    })

    return NextResponse.json({ ok: true, message: 'Diligencia eliminada correctamente' })
  } catch (error) {
    console.error('Error eliminando diligencia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al eliminar la diligencia'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

