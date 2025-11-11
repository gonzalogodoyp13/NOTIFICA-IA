import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { StatusChangeSchema } from '@/lib/validations/rol-workspace'

export const dynamic = 'force-dynamic'

type EstadoRol = 'pendiente' | 'en_proceso' | 'terminado' | 'archivado'

const ALLOWED_TRANSITIONS: Record<EstadoRol, EstadoRol[]> = {
  pendiente: ['en_proceso', 'archivado'],
  en_proceso: ['terminado', 'archivado'],
  terminado: ['archivado'],
  archivado: [],
}

async function canMarkAsTerminado(rolId: string) {
  const diligencias = await prisma.diligencia.findMany({
    where: { rolId },
    select: { estado: true },
  })

  if (diligencias.length === 0) {
    return false
  }

  return diligencias.every(d => d.estado === 'completada')
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const parsed = StatusChangeSchema.safeParse(await req.json())

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const { estado: nextEstado } = parsed.data
    const officeIdStr = String(user.officeId)

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: officeIdStr,
      },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const currentEstado = rol.estado as EstadoRol

    if (currentEstado === 'archivado' && nextEstado !== 'archivado') {
      return NextResponse.json(
        { ok: false, error: 'El ROL archivado no permite reactivación' },
        { status: 400 }
      )
    }

    if (currentEstado === nextEstado) {
      return NextResponse.json({ ok: true, data: rol })
    }

    const allowed = ALLOWED_TRANSITIONS[currentEstado] || []

    if (!allowed.includes(nextEstado)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Transición inválida de ${currentEstado} a ${nextEstado}`,
        },
        { status: 400 }
      )
    }

    if (nextEstado === 'terminado') {
      const isComplete = await canMarkAsTerminado(rol.id)
      if (!isComplete) {
        return NextResponse.json(
          {
            ok: false,
            error: 'No es posible marcar como terminado: existen diligencias pendientes',
          },
          { status: 400 }
        )
      }
    }

    const updatedRol = await prisma.rolCausa.update({
      where: { id: rol.id },
      data: {
        estado: nextEstado,
      },
    })

    await logAudit({
      userEmail: user.email,
      userId: user.id,
      officeId: officeIdStr,
      rolId: rol.id,
      tabla: 'RolCausa',
      accion: 'Actualizó estado del Rol',
      diff: { de: currentEstado, a: nextEstado },
    })

    return NextResponse.json({ ok: true, data: updatedRol })
  } catch (error) {
    console.error('Error actualizando estado de rol:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al actualizar el estado del rol' },
      { status: 500 }
    )
  }
}

