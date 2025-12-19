import { NextRequest, NextResponse } from 'next/server'

import { randomUUID } from 'crypto'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
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

    // Verificar que la diligencia pertenece al rol
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

    // Crear nueva notificación
    const notificacion = await prisma.notificacion.create({
      data: {
        id: randomUUID(),
        diligenciaId: params.diligenciaId,
        meta: {}, // Evitar null para no chocar con Prisma JSON/DB
        // createdAt: se deja al default DB si existe
        updatedAt: new Date(), // DB suele ser NOT NULL sin trigger/default
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
        id: notificacion.id,
        diligenciaId: notificacion.diligenciaId,
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
