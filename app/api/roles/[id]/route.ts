// API route: /api/roles/[id]
// GET: Returns full details of one RolCausa with all relations
// Includes: tribunal, demanda (with abogado), diligencias, documentos, notas, recibos
// Filtered by user.officeId
// Returns data matching RolDataSchema from frontend
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`[GET /api/roles/${params.id}] Request received`)
    
    const user = await getCurrentUserWithOffice()

    if (!user) {
      console.log(`[GET /api/roles/${params.id}] Unauthorized - no user`)
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    console.log(`[GET /api/roles/${params.id}] User authenticated:`, { id: user.id, email: user.email, officeId: user.officeId })

    // Single optimized Prisma query with all necessary relations
    const rolCausa = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId, // Int officeId - no conversion needed
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
            // @ts-expect-error - materia relation exists but Prisma client needs regeneration
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
      console.log(`[GET /api/roles/${params.id}] RolCausa not found or doesn't belong to user's office`)
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    console.log(`[GET /api/roles/${params.id}] Success - RolCausa found:`, { id: rolCausa.id, rol: rolCausa.rol })

    // Build rol object
    const rol = {
      id: rolCausa.id,
      numero: rolCausa.rol,
      estado: rolCausa.estado,
      createdAt: rolCausa.createdAt.toISOString(),
    }

    // Build tribunal object
    const tribunal = rolCausa.tribunal
      ? {
          id: rolCausa.tribunal.id,
          nombre: rolCausa.tribunal.nombre,
          direccion: rolCausa.tribunal.direccion ?? null,
          comuna: rolCausa.tribunal.comuna ?? null,
        }
      : null

    // Build demanda object
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
        }
      : null

    // Build abogado object
    const abogado = rolCausa.demanda?.abogados
      ? {
          id: rolCausa.demanda.abogados.id ?? null,
          nombre: rolCausa.demanda.abogados.nombre ?? null,
          rut: rolCausa.demanda.abogados.rut ?? null,
          email: rolCausa.demanda.abogados.email ?? null,
          telefono: rolCausa.demanda.abogados.telefono ?? null,
          banco: rolCausa.demanda.abogados.banco
            ? {
                id: rolCausa.demanda.abogados.banco.id,
                nombre: rolCausa.demanda.abogados.banco.nombre,
              }
            : null,
        }
      : null

    // Calculate ultimaActividad
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

    // Calculate KPIs
    const kpis = {
      diligenciasTotal: rolCausa.diligencias.length,
      diligenciasPendientes: rolCausa.diligencias.filter((d: any) => d.estado === 'pendiente').length,
      diligenciasCompletadas: rolCausa.diligencias.filter((d: any) => d.estado === 'completada').length,
      documentosTotal: rolCausa.documentos.length,
      notasTotal: rolCausa.notas.length,
      recibosTotal: rolCausa.recibos.length,
    }

    // Build resumen.diligencias
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

    // Build resumen.documentos
    const resumenDocumentos = rolCausa.documentos.map((doc: any) => ({
      id: doc.id,
      nombre: doc.nombre,
      tipo: doc.tipo,
      version: doc.version,
      pdfId: doc.pdfId ?? null,
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
    }))

    // Build resumen.notas
    const resumenNotas = rolCausa.notas.map((nota: any) => ({
      id: nota.id,
      contenido: nota.contenido,
      userId: nota.userId,
      createdAt: nota.createdAt.toISOString(),
    }))

    // Build resumen.recibos
    const resumenRecibos = rolCausa.recibos.map((recibo: any) => ({
      id: recibo.id,
      monto: Number(recibo.monto), // Convert Float to number
      medio: recibo.medio,
      ref: recibo.ref ?? null,
      createdAt: recibo.createdAt.toISOString(),
    }))

    // Assemble final response matching RolDataSchema
    const data = {
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

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    console.error(`[GET /api/roles/${params.id}] Error:`, error)
    console.error(`[GET /api/roles/${params.id}] Error details:`, {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
    })
    return NextResponse.json(
      { ok: false, error: `Error al obtener el rol: ${error?.message || 'Error desconocido'}` },
      { status: 500 }
    )
  }
}

