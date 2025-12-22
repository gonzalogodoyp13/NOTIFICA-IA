import { NextRequest, NextResponse } from 'next/server'

import { randomUUID } from 'crypto'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; diligenciaId: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    // Verificar que el rol pertenece a la oficina del usuario
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

    // Parse request body (allow empty for backward compatibility)
    const body = await req.json().catch(() => ({}))
    const ejecutadoIdFromBody = typeof body?.ejecutadoId === 'string' ? body.ejecutadoId : null

    // Verificar que la diligencia pertenece al rol
    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.diligenciaId,
        rolId: rol.id,
      },
      include: {
        rol: {
          include: {
            demanda: {
              include: {
                ejecutados: true,
              },
            },
          },
        },
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a este ROL' },
        { status: 404 }
      )
    }

    // Get ejecutados from demanda
    const ejecutados = diligencia.rol?.demanda?.ejecutados ?? []
    const ejecutadosCount = ejecutados.length

    // Validation rules
    let finalEjecutadoId: string | null = null

    if (ejecutadosCount === 0) {
      return NextResponse.json(
        { ok: false, error: 'No se puede crear notificación: la demanda no tiene ejecutados registrados' },
        { status: 400 }
      )
    } else if (ejecutadosCount === 1) {
      // Auto-select if only 1 ejecutado
      finalEjecutadoId = ejecutados[0].id
      // If body provided ejecutadoId, validate it matches
      if (ejecutadoIdFromBody && ejecutadoIdFromBody !== finalEjecutadoId) {
        return NextResponse.json(
          { ok: false, error: 'El ejecutado proporcionado no pertenece a esta demanda' },
          { status: 400 }
        )
      }
    } else {
      // Multiple ejecutados: require selection
      if (!ejecutadoIdFromBody) {
        return NextResponse.json(
          { ok: false, error: 'Se requiere seleccionar un ejecutado (la demanda tiene múltiples ejecutados)' },
          { status: 400 }
        )
      }
      // Validate ejecutadoId belongs to demanda
      const isValidEjecutado = ejecutados.some(e => e.id === ejecutadoIdFromBody)
      if (!isValidEjecutado) {
        return NextResponse.json(
          { ok: false, error: 'El ejecutado seleccionado no pertenece a esta demanda' },
          { status: 400 }
        )
      }
      finalEjecutadoId = ejecutadoIdFromBody
    }

    // Crear nueva notificación
    const notificacion = await prisma.notificacion.create({
      data: {
        id: randomUUID(),
        diligenciaId: params.diligenciaId,
        ejecutadoId: finalEjecutadoId,
        meta: {}, // Evitar null para no chocar con Prisma JSON/DB
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

    return NextResponse.json({
      ok: true,
      data: {
        id: notificacion.id,
        diligenciaId: notificacion.diligenciaId,
        ejecutadoId: notificacion.ejecutadoId,
        meta: notificacion.meta,
        createdAt: notificacion.createdAt ? notificacion.createdAt.toISOString() : null,
        updatedAt: notificacion.updatedAt ? notificacion.updatedAt.toISOString() : null,
      },
    })
  } catch (error) {
    console.error('Error creando notificación:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al crear la notificación' },
      { status: 500 }
    )
  }
}
