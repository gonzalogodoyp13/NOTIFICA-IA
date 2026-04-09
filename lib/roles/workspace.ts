import { prisma } from '@/lib/prisma'

export async function loadRoleHeaderData(roleId: string, officeId: number) {
  const rolCausa = await prisma.rolCausa.findFirst({
    where: {
      id: roleId,
      officeId,
    },
    include: {
      tribunal: {
        select: {
          id: true,
          nombre: true,
          direccion: true,
          comuna: true,
        },
      },
    },
  })

  if (!rolCausa) {
    return null
  }

  return {
    rol: {
      id: rolCausa.id,
      numero: rolCausa.rol,
      estado: rolCausa.estado,
      createdAt: rolCausa.createdAt.toISOString(),
    },
    tribunal: rolCausa.tribunal
      ? {
          id: rolCausa.tribunal.id,
          nombre: rolCausa.tribunal.nombre,
          direccion: rolCausa.tribunal.direccion ?? null,
          comuna: rolCausa.tribunal.comuna ?? null,
        }
      : null,
  }
}

export async function loadRoleSummaryData(roleId: string, officeId: number) {
  const rolCausa = await prisma.rolCausa.findFirst({
    where: {
      id: roleId,
      officeId,
    },
    include: {
      tribunal: {
        select: {
          id: true,
          nombre: true,
          direccion: true,
          comuna: true,
        },
      },
      demanda: {
        include: {
          materia: true,
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
          abogados: {
            include: {
              bancos: {
                select: {
                  banco: {
                    select: {
                      id: true,
                      nombre: true,
                    },
                  },
                },
              },
            },
          },
          procurador: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
      },
      diligencias: {
        include: {
          tipo: {
            select: {
              id: true,
              nombre: true,
              descripcion: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      documentos: {
        include: {
          diligencia: {
            include: {
              tipo: {
                select: {
                  nombre: true,
                },
              },
            },
          },
          estampo: {
            select: {
              id: true,
              nombre: true,
              tipo: true,
            },
          },
          estampoBase: {
            select: {
              id: true,
              nombreVisible: true,
              categoria: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      notas: {
        select: {
          id: true,
          contenido: true,
          userId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      recibos: {
        select: {
          id: true,
          monto: true,
          medio: true,
          ref: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  }) as any

  if (!rolCausa) {
    return null
  }

  const rol = {
    id: rolCausa.id,
    numero: rolCausa.rol,
    estado: rolCausa.estado,
    createdAt: rolCausa.createdAt.toISOString(),
  }

  const tribunal = rolCausa.tribunal
    ? {
        id: rolCausa.tribunal.id,
        nombre: rolCausa.tribunal.nombre,
        direccion: rolCausa.tribunal.direccion ?? null,
        comuna: rolCausa.tribunal.comuna ?? null,
      }
    : null

  const demanda = rolCausa.demanda
    ? {
        id: rolCausa.demanda.id,
        cuantia: rolCausa.demanda.cuantia ?? null,
        caratula: rolCausa.demanda.caratula ?? null,
        materia: rolCausa.demanda.materia
          ? {
              id: rolCausa.demanda.materia.id,
              nombre: rolCausa.demanda.materia.nombre,
            }
          : null,
        ejecutados: rolCausa.demanda.ejecutados
          ? rolCausa.demanda.ejecutados.map((ej: any) => ({
              id: ej.id,
              nombre: ej.nombre,
              rut: ej.rut,
              direccion: ej.direccion ?? null,
              comuna: ej.comunas
                ? {
                    id: ej.comunas.id,
                    nombre: ej.comunas.nombre,
                  }
                : null,
            }))
          : [],
        procurador: rolCausa.demanda.procurador
          ? {
              id: rolCausa.demanda.procurador.id,
              nombre: rolCausa.demanda.procurador.nombre,
            }
          : null,
      }
    : null

  const abogado = rolCausa.demanda?.abogados
    ? {
        id: rolCausa.demanda.abogados.id ?? null,
        nombre: rolCausa.demanda.abogados.nombre ?? null,
        rut: rolCausa.demanda.abogados.rut ?? null,
        email: rolCausa.demanda.abogados.email ?? null,
        telefono: rolCausa.demanda.abogados.telefono ?? null,
        bancos: (rolCausa.demanda.abogados.bancos ?? []).map((item: any) => ({
          banco: {
            id: item.banco.id,
            nombre: item.banco.nombre,
          },
        })),
      }
    : null

  const allDates: Date[] = [
    ...rolCausa.diligencias.map((d: any) => d.createdAt),
    ...rolCausa.documentos.map((d: any) => d.createdAt),
    ...rolCausa.notas.map((n: any) => n.createdAt),
    ...rolCausa.recibos.map((r: any) => r.createdAt),
  ]
  const ultimaActividad =
    allDates.length > 0
      ? new Date(Math.max(...allDates.map((d: any) => d.getTime()))).toISOString()
      : null

  const kpis = {
    diligenciasTotal: rolCausa.diligencias.length,
    diligenciasPendientes: rolCausa.diligencias.filter((d: any) => d.estado === 'pendiente').length,
    diligenciasCompletadas: rolCausa.diligencias.filter((d: any) => d.estado === 'completada').length,
    documentosTotal: rolCausa.documentos.length,
    notasTotal: rolCausa.notas.length,
    recibosTotal: rolCausa.recibos.length,
  }

  const resumenDiligencias = rolCausa.diligencias.map((d: any) => ({
    id: d.id,
    tipo: {
      id: d.tipo.id,
      nombre: d.tipo.nombre,
      descripcion: d.tipo.descripcion ?? null,
    },
    estado: d.estado,
    fecha: d.fecha.toISOString(),
    meta: d.meta as Record<string, unknown> | null,
    createdAt: d.createdAt.toISOString(),
  }))

  const resumenDocumentos = rolCausa.documentos.map((doc: any) => ({
    id: doc.id,
    nombre: doc.nombre,
    tipo: doc.tipo,
    version: doc.version,
    hasPdf: !!doc.pdfId,
    createdAt: doc.createdAt.toISOString(),
    diligencia: doc.diligencia
      ? {
          id: doc.diligencia.id,
          tipo: doc.diligencia.tipo?.nombre ?? null,
        }
      : null,
    estampo: doc.estampo
      ? {
          id: doc.estampo.id,
          nombre: doc.estampo.nombre,
          tipo: doc.estampo.tipo,
        }
      : null,
    estampoBase: doc.estampoBase
      ? {
          id: doc.estampoBase.id,
          nombreVisible: doc.estampoBase.nombreVisible,
          categoria: doc.estampoBase.categoria,
        }
      : null,
  }))

  const resumenNotas = rolCausa.notas.map((nota: any) => ({
    id: nota.id,
    contenido: nota.contenido,
    userId: nota.userId,
    createdAt: nota.createdAt.toISOString(),
  }))

  const resumenRecibos = rolCausa.recibos.map((recibo: any) => ({
    id: recibo.id,
    monto: Number(recibo.monto),
    medio: recibo.medio,
    ref: recibo.ref ?? null,
    createdAt: recibo.createdAt.toISOString(),
  }))

  return {
    rol,
    tribunal,
    demanda,
    abogado,
    ultimaActividad,
    kpis,
    resumen: {
      diligencias: resumenDiligencias,
      documentos: resumenDocumentos,
      notas: resumenNotas,
      recibos: resumenRecibos,
    },
  }
}
