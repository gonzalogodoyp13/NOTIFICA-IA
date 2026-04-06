import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type BulkRecibosPayload = {
  action?: 'markPaid' | 'associateBoleta'
  reciboIds?: string[]
  numeroBoleta?: string
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = (await req.json()) as BulkRecibosPayload
    const reciboIds = Array.from(new Set((body.reciboIds ?? []).filter(Boolean)))

    if (reciboIds.length === 0) {
      throw new Error('Debes seleccionar al menos un recibo.')
    }

    const recibos = await prisma.recibo.findMany({
      where: {
        id: { in: reciboIds },
        rol: {
          officeId: user.officeId,
        },
      },
      select: {
        id: true,
        diligenciaId: true,
      },
    })

    if (recibos.length !== reciboIds.length) {
      throw new Error('Uno o mas recibos no existen o no pertenecen a tu oficina.')
    }

    if (body.action === 'markPaid') {
      const diligenciaIds = Array.from(
        new Set(
          recibos
            .map(recibo => recibo.diligenciaId)
            .filter((value): value is string => Boolean(value))
        )
      )

      if (diligenciaIds.length > 0) {
        await prisma.diligencia.updateMany({
          where: {
            id: { in: diligenciaIds },
            rol: {
              officeId: user.officeId,
            },
          },
          data: {
            boletaEstado: 'PAGADO',
          },
        })
      }

      return NextResponse.json({ ok: true, data: { updatedCount: recibos.length } })
    }

    if (body.action === 'associateBoleta') {
      const numeroBoleta = body.numeroBoleta?.trim()

      if (!numeroBoleta) {
        throw new Error('Debes ingresar un numero de boleta.')
      }

      await prisma.recibo.updateMany({
        where: {
          id: { in: reciboIds },
          rol: {
            officeId: user.officeId,
          },
        },
        data: {
          numeroBoleta,
        },
      })

      return NextResponse.json({
        ok: true,
        data: {
          updatedCount: recibos.length,
          numeroBoleta,
        },
      })
    }

    throw new Error('Accion no soportada.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al actualizar recibos'

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 }
    )
  }
}
