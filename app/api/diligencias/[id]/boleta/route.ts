import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { BoletaGenerateSchema } from '@/lib/validations/rol-workspace'
import { buildReciboVariables, buildReciboPdf, loadReciboStamp } from '@/lib/pdf/recibo'
import type { DiligenciaWithReciboRelations } from '@/lib/pdf/recibo'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    // Get user with officeName from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { officeName: true },
    })

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: user.officeId,
        },
      },
      include: {
        rol: {
          include: {
            tribunal: true,
            demanda: {
              include: {
                abogados: {
                  include: { banco: true },
                },
                ejecutados: {
                  include: { comunas: true },
                },
              },
            },
          },
        },
        tipo: {
          select: { nombre: true },
        },
      },
    }) as DiligenciaWithReciboRelations | null

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const raw = await req.json().catch(() => ({}))
    const notificacionId = typeof raw?.notificacionId === 'string' ? raw.notificacionId : null

    const parsed = BoletaGenerateSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const data = parsed.data

    if (notificacionId) {
      const noti = await prisma.notificacion.findFirst({
        where: { id: notificacionId, diligenciaId: diligencia.id },
        select: { id: true },
      })

      if (!noti) {
        return NextResponse.json({ ok: false, error: 'Notificación no encontrada' }, { status: 404 })
      }
    }

    // Build Recibo variables
    const variables = buildReciboVariables(
      diligencia,
      dbUser,
      data.monto,
      data.medio,
      data.referencia,
      data.tipoEstampoNombre // Pasar el nombre del estampo
    )

    // Load stamp image
    const stampBytes = await loadReciboStamp()

    // Generate PDF
    const pdfBase64 = await buildReciboPdf(variables, stampBytes)

    const documento = await prisma.documento.create({
      data: {
        rolId: diligencia.rolId,
        diligenciaId: diligencia.id,
        notificacionId: notificacionId ?? null,
        nombre: `Recibo ${variables.numero_recibo}`,
        tipo: 'Recibo',
        pdfId: pdfBase64,
        version: 1,
      },
    })

    await prisma.recibo.create({
      data: {
        rolId: diligencia.rolId,
        monto: data.monto,
        medio: data.medio,
        ref: data.referencia ?? null,
      },
    })

    return NextResponse.json({ ok: true, data: documento })
  } catch (error) {
    console.error('Error generando boleta:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al generar la boleta' },
      { status: 500 }
    )
  }
}

