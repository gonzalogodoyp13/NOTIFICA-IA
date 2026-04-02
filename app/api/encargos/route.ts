// API route: /api/encargos
// GET: List all diligencias (encargos) for the current office with computed fields
// Returns: { ok: true, data: EncargoItem[], kpis: { total, activos, realizadosCobrados, realizadosNoCobrados } }
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Fetch all diligencias for the user's office
    const diligencias = await prisma.diligencia.findMany({
      where: {
        rol: {
          officeId: user.officeId,
        },
      },
      select: {
        id: true,
        createdAt: true,
        boletaEstado: true,
        tipo: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
          },
        },
        rol: {
          select: {
            id: true,
            rol: true,
            demanda: {
              select: {
                abogados: {
                  select: {
                    id: true,
                    nombre: true,
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
                    abogados: {
                      select: {
                        abogado: {
                          select: {
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
                      },
                    },
                  },
                },
              },
            },
          },
        },
        documentos: {
          where: {
            tipo: 'Estampo',
            pdfId: { not: null },
            voidedAt: null,
          },
          select: {
            id: true,
            createdAt: true,
          },
        },
        notificaciones: {
          where: {
            voidedAt: null,
          },
          select: {
            id: true,
            documentos: {
              where: {
                tipo: 'Estampo',
                pdfId: { not: null },
                voidedAt: null,
              },
              select: {
                id: true,
                createdAt: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Map diligencias to EncargoItem format
    const data = diligencias.map(diligencia => {
      // Combine estampos from diligencia.documentos AND notificaciones.documentos
      const estamposDirectos = diligencia.documentos
      const estamposNotificaciones = diligencia.notificaciones.flatMap(n => n.documentos || [])
      const allEstampos = [...estamposDirectos, ...estamposNotificaciones]

      // Calculate computed fields
      const estamposCount = allEstampos.length
      const estado = estamposCount > 0 ? ('REALIZADO' as const) : ('ACTIVO' as const)
      const estamposExtraCount = Math.max(estamposCount - 1, 0)
      const fechaRealizado =
        estamposCount > 0
          ? new Date(Math.min(...allEstampos.map(e => new Date(e.createdAt).getTime()))).toISOString()
          : null
      const notificacionesCount = diligencia.notificaciones.length

      // Extract abogado (singular, though relation is named plural)
      const abogado = diligencia.rol.demanda?.abogados
        ? {
            id: diligencia.rol.demanda.abogados.id,
            nombre: diligencia.rol.demanda.abogados.nombre,
          }
        : null

      // Extract procurador
      const procurador = diligencia.rol.demanda?.procurador
        ? {
            id: diligencia.rol.demanda.procurador.id,
            nombre: diligencia.rol.demanda.procurador.nombre,
          }
        : null

      // Collect all bancos (from abogado and procurador) and deduplicate
      const bancosSet = new Map<number, { id: number; nombre: string }>()

      if (diligencia.rol.demanda?.abogados) {
        const abogadoData = diligencia.rol.demanda.abogados
        if (abogadoData.bancos) {
          abogadoData.bancos.forEach(ab => {
            if (ab.banco) {
              bancosSet.set(ab.banco.id, {
                id: ab.banco.id,
                nombre: ab.banco.nombre,
              })
            }
          })
        }
      }

      if (diligencia.rol.demanda?.procurador?.abogados) {
        diligencia.rol.demanda.procurador.abogados.forEach(pa => {
          pa.abogado?.bancos?.forEach(ab => {
            if (ab.banco) {
              bancosSet.set(ab.banco.id, {
                id: ab.banco.id,
                nombre: ab.banco.nombre,
              })
            }
          })
        })
      }

      const bancos = Array.from(bancosSet.values())

      return {
        id: diligencia.id,
        createdAt: diligencia.createdAt.toISOString(),
        tipo: {
          id: diligencia.tipo.id,
          nombre: diligencia.tipo.nombre,
          descripcion: diligencia.tipo.descripcion,
        },
        rol: {
          id: diligencia.rol.id,
          numero: diligencia.rol.rol,
        },
        abogado,
        procurador,
        bancos,
        notificacionesCount,
        estamposCount,
        estado,
        fechaRealizado,
        estamposExtraCount,
        boletaEstado: diligencia.boletaEstado === 'PAGADO' ? ('PAGADO' as const) : ('NO_PAGADO' as const),
      }
    })

    // Calculate KPIs
    const kpis = {
      total: data.length,
      activos: data.filter(d => d.estado === 'ACTIVO').length,
      realizadosCobrados: data.filter(d => d.estado === 'REALIZADO' && d.boletaEstado === 'PAGADO').length,
      realizadosNoCobrados: data.filter(d => d.estado === 'REALIZADO' && d.boletaEstado === 'NO_PAGADO').length,
    }

    return NextResponse.json({
      ok: true,
      data,
      kpis,
    })
  } catch (error) {
    console.error('Error fetching encargos:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los encargos'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}
