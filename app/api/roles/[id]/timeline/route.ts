import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

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

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: {
          contains: `[ROL:${rol.id}]`,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    const data = auditLogs.map(log => ({
      id: log.id,
      userEmail: log.userEmail,
      accion: log.action,
      createdAt: log.createdAt.toISOString(),
    }))

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Error obteniendo timeline del rol:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener el timeline del rol' },
      { status: 500 }
    )
  }
}

