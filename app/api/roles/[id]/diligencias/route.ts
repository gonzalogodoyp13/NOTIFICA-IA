import { NextRequest, NextResponse } from 'next/server'

import { Prisma } from '@prisma/client'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { DiligenciaCreateSchema } from '@/lib/validations/rol-workspace'

export const dynamic = 'force-dynamic'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function mapLatestEstampo(documento: any) {
  if (!documento) return null

  if (documento.estampoBase) {
    return {
      documentoId: documento.id,
      slug: documento.estampoBase.slug,
      nombreVisible: documento.estampoBase.nombreVisible,
    }
  }

  if (documento.estampo) {
    return {
      documentoId: documento.id,
      slug: null,
      nombreVisible: documento.estampo.nombre,
    }
  }

  return null
}

function mapNotificacion(notificacion: any) {
  const meta = isPlainObject(notificacion.meta) ? notificacion.meta : {}
  const documentos = Array.isArray(notificacion.documentos) ? notificacion.documentos : []
  const latestBoleta = documentos.find((doc: any) => doc.tipo === 'Recibo') ?? null
  const latestEstampoDoc = documentos.find((doc: any) => doc.tipo === 'Estampo') ?? null

  return {
    id: notificacion.id,
    diligenciaId: notificacion.diligenciaId,
    meta: notificacion.meta,
    ejecutadoId: (notificacion as any).ejecutadoId ?? null,
    createdAt: notificacion.createdAt ? notificacion.createdAt.toISOString() : null,
    updatedAt: notificacion.updatedAt ? notificacion.updatedAt.toISOString() : null,
    voidedAt: (notificacion as any).voidedAt ? (notificacion as any).voidedAt.toISOString() : null,
    voidReason: (notificacion as any).voidReason ?? null,
    voidedByUserId: (notificacion as any).voidedByUserId ?? null,
    step1Done: !!meta.fechaEjecucion,
    step2Done: !!latestBoleta,
    step3Done: !!latestEstampoDoc,
    latestBoletaId: latestBoleta?.id ?? null,
    latestEstampoId: latestEstampoDoc?.id ?? null,
    latestEstampo: mapLatestEstampo(latestEstampoDoc),
  }
}

function mapDiligencia(diligencia: any) {
  return {
    id: diligencia.id,
    tipo: {
      id: diligencia.tipoId,
      nombre: diligencia.tipo.nombre,
      descripcion: diligencia.tipo.descripcion,
    },
    estado: diligencia.estado,
    fecha: diligencia.fecha.toISOString(),
    meta: diligencia.meta,
    createdAt: diligencia.createdAt.toISOString(),
    ejecutados: (diligencia.rol?.demanda?.ejecutados ?? []).map((ejecutado: any) => ({
      id: ejecutado.id,
      nombre: ejecutado.nombre,
      direccion: [ejecutado.direccion, ejecutado.comunas?.nombre].filter(Boolean).join(', '),
    })),
    notificaciones: (diligencia.notificaciones ?? []).map(mapNotificacion),
  }
}

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

    const diligencias = await prisma.diligencia.findMany({
      where: { rolId: rol.id },
      include: {
        tipo: true,
        rol: {
          include: {
            demanda: {
              include: {
                ejecutados: {
                  include: {
                    comunas: {
                      select: {
                        id: true,
                        nombre: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        notificaciones: {
          orderBy: { createdAt: 'asc' },
          include: {
            documentos: {
              where: {
                tipo: { in: ['Recibo', 'Estampo'] },
                voidedAt: null,
              },
              orderBy: { createdAt: 'desc' },
              include: {
                estampoBase: {
                  select: {
                    id: true,
                    slug: true,
                    nombreVisible: true,
                  },
                },
                estampo: {
                  select: {
                    id: true,
                    nombre: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: diligencias.map(mapDiligencia) })
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

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
      include: {
        demanda: {
          include: {
            ejecutados: {
              include: {
                comunas: {
                  select: {
                    id: true,
                    nombre: true,
                  },
                },
              },
            },
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
        officeId: user.officeId,
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

    return NextResponse.json({
      ok: true,
      data: mapDiligencia({
        ...diligencia,
        rol,
        notificaciones: [],
      }),
    })
  } catch (error) {
    console.error('Error creando diligencia:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al crear la diligencia' },
      { status: 500 }
    )
  }
}
