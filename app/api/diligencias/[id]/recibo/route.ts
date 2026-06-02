import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ReciboGenerateSchema } from '@/lib/validations/rol-workspace'
import { buildReciboVariables, buildReciboPdf, loadReciboStamp } from '@/lib/pdf/recibo'
import type { DiligenciaWithReciboRelations } from '@/lib/pdf/recibo'

export const dynamic = 'force-dynamic'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseBusinessDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getFechaEjecucionFromMeta(meta: unknown) {
  if (!isPlainObject(meta)) {
    return null
  }

  const direct = parseBusinessDate(meta.fechaEjecucion)
  if (direct) {
    return direct
  }

  const ejecucion = isPlainObject(meta.ejecucion) ? meta.ejecucion : null
  return parseBusinessDate(ejecucion?.fecha)
}

function formatNumeroRecibo(year: number, sequence: number) {
  return `R-${year}-${String(sequence).padStart(6, '0')}`
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
                  include: {
                    bancos: {
                      include: {
                        banco: true,
                      },
                    },
                  },
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

    const parsed = ReciboGenerateSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const data = parsed.data

    let ejecutadoFromNotificacion: any
    let notificacionMeta: unknown = null

    if (notificacionId) {
      const noti = await prisma.notificacion.findFirst({
        where: { id: notificacionId, diligenciaId: diligencia.id },
        include: {
          ejecutado: {
            include: {
              comunas: {
                select: {
                  id: true,
                  nombre: true,
                },
              },
            },
          },
        } as any,
      })

      if (!noti) {
        return NextResponse.json({ ok: false, error: 'Notificacion no encontrada' }, { status: 404 })
      }

      if (!(noti as any).ejecutadoId || !(noti as any).ejecutado) {
        return NextResponse.json(
          { ok: false, error: 'Esta notificacion requiere seleccionar un ejecutado antes de generar documentos.' },
          { status: 400 }
        )
      }

      ejecutadoFromNotificacion = (noti as any).ejecutado
      notificacionMeta = (noti as any).meta ?? null
    }

    const fechaEjecucion =
      getFechaEjecucionFromMeta(notificacionMeta) ??
      getFechaEjecucionFromMeta(diligencia.meta)

    if (!fechaEjecucion) {
      return NextResponse.json(
        { ok: false, error: 'Debes registrar la fecha de ejecucion antes de generar el recibo.' },
        { status: 400 }
      )
    }

    const fechaRecibo = new Date()
    const numeroReciboYear = fechaRecibo.getFullYear()
    const stampBytes = await loadReciboStamp()

    const documento = await prisma.$transaction(async tx => {
      const sequenceRows = await tx.$queryRaw<Array<{ assignedNumber: number }>>`
        INSERT INTO "DocumentNumberSequence" (
          "id",
          "officeId",
          "year",
          "documentType",
          "nextNumber"
        )
        VALUES (
          ${`recibo-${user.officeId}-${numeroReciboYear}`},
          ${user.officeId},
          ${numeroReciboYear},
          'RECIBO'::"DocumentType",
          2
        )
        ON CONFLICT ("officeId", "year", "documentType")
        DO UPDATE SET
          "nextNumber" = "DocumentNumberSequence"."nextNumber" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "nextNumber" - 1 AS "assignedNumber"
      `

      const assignedNumber = Number(sequenceRows[0]?.assignedNumber)

      if (!Number.isInteger(assignedNumber) || assignedNumber < 1) {
        throw new Error('No se pudo asignar un numero de recibo valido.')
      }

      const numeroRecibo = formatNumeroRecibo(numeroReciboYear, assignedNumber)
      const variables = buildReciboVariables(
        diligencia,
        dbUser,
        numeroRecibo,
        data.monto,
        data.medio,
        fechaEjecucion,
        data.referencia,
        data.tipoEstampoNombre,
        ejecutadoFromNotificacion
      )
      const pdfBase64 = await buildReciboPdf(variables, stampBytes)
      const numeroBoleta = data.referencia?.trim() || variables.n_operacion.trim() || null

      const createdDocumento = await tx.documento.create({
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

      await tx.recibo.create({
        data: {
          rolId: diligencia.rolId,
          officeId: user.officeId,
          diligenciaId: diligencia.id,
          notificacionId: notificacionId ?? null,
          documentoId: createdDocumento.id,
          numeroRecibo: variables.numero_recibo,
          numeroReciboYear,
          numeroBoleta,
          monto: data.monto,
          medio: data.medio,
          ref: data.referencia ?? null,
          fechaEjecucion,
          fechaRecibo,
        },
      })

      await tx.diligencia.update({
        where: { id: diligencia.id },
        data: {
          estadoCobro: 'PAGADO',
        },
      })

      return createdDocumento
    })

    return NextResponse.json({
      ok: true,
      data: {
        id: documento.id,
        nombre: documento.nombre,
        tipo: documento.tipo,
        version: documento.version,
        hasPdf: !!documento.pdfId,
        createdAt: documento.createdAt.toISOString(),
        diligenciaId: documento.diligenciaId,
        notificacionId: documento.notificacionId,
        voidedAt: null,
        voidReason: null,
        voidedByUserId: null,
        diligencia: {
          id: diligencia.id,
          tipo: diligencia.tipo?.nombre ?? null,
        },
        estampo: null,
        estampoBase: null,
      },
    })
  } catch (error) {
    console.error('Error generando recibo:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al generar el recibo' },
      { status: 500 }
    )
  }
}
