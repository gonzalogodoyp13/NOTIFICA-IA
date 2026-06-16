import { NextRequest, NextResponse } from 'next/server'

import { Prisma } from '@prisma/client'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { ApiError, apiFailure, parseApiInput } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'
import { DiligenciaCreateSchema } from '@/lib/validations/rol-workspace'
import { deriveNotificationCompleteness } from '@/lib/workflow/completeness'
import { deriveNotificationWorkflowState } from '@/lib/workflow/notificationStatus'

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
  const workflow = deriveNotificationWorkflowState(documentos)
  const latestRecibo = workflow.latestRecibo
  const latestEstampoDoc = workflow.latestEstampo

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
    workflowStatus: workflow.workflowStatus,
    completeness: deriveNotificationCompleteness({ notificacion, diligencia: notificacion.diligencia }),
    step1Done: !!meta.fechaEjecucion,
    step2Done: workflow.hasReciboPdf,
    step3Done: workflow.hasEstampoPdf,
    latestReciboId: latestRecibo?.id ?? null,
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
      return apiFailure(new ApiError('UNAUTHORIZED', 'No autorizado', 401))
    }

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
      select: { id: true },
    })

    if (!rol) {
      return apiFailure(new ApiError('NOT_FOUND', 'Rol no encontrado o no pertenece a tu oficina', 404))
    }

    const diligencias = await prisma.diligencia.findMany({
      where: { rolId: rol.id },
      include: {
        tipo: true,
        rol: {
          include: {
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
            diligencia: {
              include: {
                rol: {
                  include: {
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
                      },
                    },
                  },
                },
              },
            },
            ejecutado: {
              include: {
                comunas: true,
              },
            },
            documentos: {
              where: {
                tipo: { in: ['Recibo', 'Estampo'] },
                voidedAt: null,
                OR: [
                  { pdfId: { not: null } },
                  { currentVersion: { is: { deletedAt: null } } },
                ],
              },
              orderBy: { createdAt: 'desc' },
              include: {
                currentVersion: true,
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
      return apiFailure(new ApiError('UNAUTHORIZED', 'No autorizado', 401))
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
      return apiFailure(new ApiError('NOT_FOUND', 'Rol no encontrado o no pertenece a tu oficina', 404))
    }

    const payload = parseApiInput(DiligenciaCreateSchema, await req.json())

    const tipo = await prisma.diligenciaTipo.findFirst({
      where: {
        id: payload.tipoId,
        officeId: user.officeId,
      },
    })

    if (!tipo) {
      return apiFailure(new ApiError('NOT_FOUND', 'Tipo de diligencia no encontrado en tu oficina', 404))
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
        return apiFailure(new ApiError('VALIDATION_ERROR', 'Ejecutado o dirección no pertenecen al ROL', 400))
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
    return apiFailure(new ApiError('INTERNAL_ERROR', 'Ocurrió un error inesperado', 500))
  }
}
