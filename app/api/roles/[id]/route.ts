// API route: /api/roles/[id]
// GET: Return full detail of one RolCausa
import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const DEFAULT_KPI = {
  diligenciasTotal: 0,
  diligenciasPendientes: 0,
  diligenciasCompletadas: 0,
  documentosTotal: 0,
  notasTotal: 0,
  recibosTotal: 0,
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

    const { id } = params
    const officeIdStr = String(user.officeId)

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id,
        officeId: officeIdStr,
      },
      include: {
        tribunal: true,
        demanda: {
          include: {
            abogados: true,
          },
        },
        diligencias: {
          include: {
            tipo: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        documentos: {
          include: {
            diligencia: {
              select: {
                id: true,
                tipo: {
                  select: {
                    nombre: true,
                  },
                },
              },
            },
            estampo: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        notas: {
          orderBy: { createdAt: 'desc' },
        },
        recibos: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!rol) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const activityDates = [
      rol.createdAt,
      ...rol.diligencias.map(d => d.createdAt),
      ...rol.documentos.map(d => d.createdAt),
      ...rol.notas.map(n => n.createdAt),
      ...rol.recibos.map(r => r.createdAt),
    ]

    const ultimaActividad =
      activityDates.length > 0
        ? new Date(Math.max(...activityDates.map(date => date.getTime()))).toISOString()
        : null

    const diligenciasPendientes = rol.diligencias.filter(d => d.estado !== 'completada').length
    const diligenciasCompletadas = rol.diligencias.filter(d => d.estado === 'completada').length

    const abogadoPrincipal = rol.demanda?.abogados
      ? {
          id: rol.demanda.abogados.id,
          nombre: rol.demanda.abogados.nombre,
          rut: rol.demanda.abogados.rut,
          email: rol.demanda.abogados.email,
          telefono: rol.demanda.abogados.telefono,
        }
      : null

    const payload = {
      rol: {
        id: rol.id,
        numero: rol.rol,
        estado: rol.estado,
        createdAt: rol.createdAt.toISOString(),
      },
      tribunal: rol.tribunal
        ? {
          id: rol.tribunal.id,
          nombre: rol.tribunal.nombre,
          direccion: rol.tribunal.direccion,
          comuna: rol.tribunal.comuna,
        }
        : null,
      demanda: rol.demanda
        ? {
          id: rol.demanda.id,
          cuantia: rol.demanda.cuantia,
          caratula: rol.demanda.caratula,
        }
        : null,
      abogado: abogadoPrincipal,
      ultimaActividad,
      kpis: {
        ...DEFAULT_KPI,
        diligenciasTotal: rol.diligencias.length,
        diligenciasPendientes,
        diligenciasCompletadas,
        documentosTotal: rol.documentos.length,
        notasTotal: rol.notas.length,
        recibosTotal: rol.recibos.length,
      },
      resumen: {
        diligencias: rol.diligencias.map(d => ({
          id: d.id,
          tipo: {
            id: d.tipoId,
            nombre: d.tipo.nombre,
          },
          estado: d.estado,
          fecha: d.fecha.toISOString(),
          meta: d.meta,
          createdAt: d.createdAt.toISOString(),
        })),
        documentos: rol.documentos.map(doc => ({
          id: doc.id,
          nombre: doc.nombre,
          tipo: doc.tipo,
          version: doc.version,
          pdfId: doc.pdfId,
          createdAt: doc.createdAt.toISOString(),
          diligencia: doc.diligencia
            ? {
                id: doc.diligencia.id,
                tipo: doc.diligencia.tipo?.nombre,
              }
            : null,
          estampo: doc.estampo
            ? {
                id: doc.estampo.id,
                nombre: doc.estampo.nombre,
                tipo: doc.estampo.tipo,
              }
            : null,
        })),
        notas: rol.notas.map(nota => ({
          id: nota.id,
          contenido: nota.contenido,
          userId: nota.userId,
          createdAt: nota.createdAt.toISOString(),
        })),
        recibos: rol.recibos.map(recibo => ({
          id: recibo.id,
          monto: recibo.monto,
          medio: recibo.medio,
          ref: recibo.ref,
          createdAt: recibo.createdAt.toISOString(),
        })),
      },
    }

    return NextResponse.json({ ok: true, data: payload })
  } catch (error) {
    console.error('Error fetching rol:', error)
    return NextResponse.json({ ok: false, error: 'Error al obtener el rol' }, { status: 500 })
  }
}

