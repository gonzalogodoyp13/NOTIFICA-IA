// API route: /api/demandas/[id]
// PUT: Update an existing Demanda and synchronize RolCausa.rol if ROL changed
// Validates user, officeId, and ensures ROL uniqueness per office
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { parseCuantiaForStorage } from '@/lib/utils/cuantia'

export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`[PUT /api/demandas/${params.id}] Request received`)
    
    const user = await getCurrentUserWithOffice()

    if (!user) {
      console.log(`[PUT /api/demandas/${params.id}] Unauthorized - no user`)
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    console.log(`[PUT /api/demandas/${params.id}] User authenticated:`, { id: user.id, email: user.email, officeId: user.officeId })

    const body = await req.json()
    console.log(`[PUT /api/demandas/${params.id}] Request body:`, JSON.stringify(body, null, 2))
    
    const { rol, tribunalId, caratula, cuantia, abogadoId, materiaId, ejecutados } = body

    // Validate required fields
    if (!rol || !tribunalId || !caratula) {
      return NextResponse.json(
        { ok: false, error: 'rol, tribunalId y caratula son requeridos' },
        { status: 400 }
      )
    }

    // Find Demanda by id and officeId to ensure isolation
    const demanda = await prisma.demanda.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
    })

    if (!demanda) {
      console.log(`[PUT /api/demandas/${params.id}] Demanda not found or doesn't belong to user's office`)
      return NextResponse.json(
        { ok: false, error: 'Demanda no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Verify tribunalId belongs to user's office
    const tribunalIdInt = typeof tribunalId === 'string' ? parseInt(tribunalId, 10) : tribunalId
    
    if (isNaN(tribunalIdInt) || !Number.isInteger(tribunalIdInt)) {
      return NextResponse.json(
        { ok: false, error: 'tribunalId debe ser un número entero válido' },
        { status: 400 }
      )
    }

    const tribunal = await prisma.tribunales.findFirst({
      where: {
        id: tribunalIdInt,
        officeId: user.officeId,
      },
    })

    if (!tribunal) {
      return NextResponse.json(
        { ok: false, error: 'Tribunal no encontrado o no pertenece a tu oficina' },
        { status: 400 }
      )
    }

    // Verify abogadoId if provided
    if (abogadoId) {
      const abogado = await prisma.abogado.findFirst({
        where: {
          id: parseInt(abogadoId),
          officeId: user.officeId,
        },
      })

      if (!abogado) {
        return NextResponse.json(
          { ok: false, error: 'Abogado no encontrado o no pertenece a tu oficina' },
          { status: 400 }
        )
      }
    }

    // Verify materiaId if provided
    if (materiaId) {
      const materia = await prisma.materia.findFirst({
        where: {
          id: parseInt(materiaId),
          officeId: user.officeId,
        },
      })

      if (!materia) {
        return NextResponse.json(
          { ok: false, error: 'Materia no encontrada o no pertenece a tu oficina' },
          { status: 400 }
        )
      }
    }

    // Validate ejecutados if provided
    if (ejecutados !== undefined) {
      if (!Array.isArray(ejecutados)) {
        return NextResponse.json(
          { ok: false, error: 'ejecutados debe ser un array' },
          { status: 400 }
        )
      }

      // Validate each ejecutado
      for (const ej of ejecutados) {
        if (!ej.nombre || !ej.rut) {
          return NextResponse.json(
            { ok: false, error: 'Cada ejecutado debe tener nombre y rut' },
            { status: 400 }
          )
        }

        // Validate comunaId if provided
        if (ej.comunaId !== null && ej.comunaId !== undefined) {
          const comuna = await prisma.comuna.findFirst({
            where: {
              id: typeof ej.comunaId === 'string' ? parseInt(ej.comunaId) : ej.comunaId,
              officeId: user.officeId,
            },
          })

          if (!comuna) {
            return NextResponse.json(
              { ok: false, error: `Comuna con ID ${ej.comunaId} no encontrada o no pertenece a tu oficina` },
              { status: 400 }
            )
          }
        }
      }
    }

    // Check if ROL changed
    const rolChanged = demanda.rol !== rol

    // If ROL changed, validate uniqueness (excluding current record)
    if (rolChanged) {
      const existingDemanda = await prisma.demanda.findFirst({
        where: {
          rol: rol,
          officeId: user.officeId,
          id: { not: params.id },
        },
      })

      if (existingDemanda) {
        console.log(`[PUT /api/demandas/${params.id}] ROL conflict: ${rol} already exists in office ${user.officeId}`)
        return NextResponse.json(
          { ok: false, error: `Ya existe una causa con el ROL ${rol} en esta oficina.` },
          { status: 400 }
        )
      }
    }

    // Update Demanda and RolCausa in a transaction
    console.log(`[PUT /api/demandas/${params.id}] Updating demanda and rolCausa...`)
    
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Demanda
      const updatedDemanda = await tx.demanda.update({
        where: { id: params.id },
        data: {
          rol,
          tribunalId: tribunalIdInt,
          caratula,
          cuantia: cuantia !== undefined && cuantia !== null 
            ? parseCuantiaForStorage(cuantia) 
            : demanda.cuantia,
          abogadoId: abogadoId ? parseInt(abogadoId) : demanda.abogadoId,
          materiaId: materiaId ? parseInt(materiaId) : null,
        },
        include: {
          tribunales: {
            select: {
              id: true,
              nombre: true,
            },
          },
          abogados: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
      })

      // 2. Replace ejecutados (FULL REPLACEMENT strategy)
      if (ejecutados !== undefined) {
        // Delete all existing ejecutados for this demanda
        await tx.ejecutado.deleteMany({
          where: { demandaId: params.id },
        })
        
        // Create new ejecutados from incoming array
        if (ejecutados.length > 0) {
          await tx.ejecutado.createMany({
            data: ejecutados.map((ej: any) => ({
              demandaId: params.id,
              nombre: ej.nombre,
              rut: ej.rut,
              direccion: ej.direccion || null,
              comunaId: ej.comunaId || null,
            })),
          })
        }
        console.log(`[PUT /api/demandas/${params.id}] ✅ Replaced ${ejecutados.length} ejecutados`)
      }

      // 3. If ROL changed, update RolCausa.rol
      if (rolChanged) {
        const rolCausa = await tx.rolCausa.findFirst({
          where: {
            demandaId: params.id,
            officeId: user.officeId,
          },
        })

        if (rolCausa) {
          await tx.rolCausa.update({
            where: { id: rolCausa.id },
            data: {
              rol: rol,
            },
          })
          console.log(`[PUT /api/demandas/${params.id}] ✅ Updated RolCausa.rol to: ${rol}`)
        } else {
          console.log(`[PUT /api/demandas/${params.id}] ⚠️ RolCausa not found for demandaId: ${params.id}`)
        }
      }

      return updatedDemanda
    })

    console.log(`[PUT /api/demandas/${params.id}] ✅ Demanda updated successfully:`, { id: result.id, rol: result.rol })

    return NextResponse.json({
      ok: true,
      data: {
        ...result,
        rolId: result.id, // Same ID for frontend navigation
      },
    })
  } catch (error: any) {
    console.error(`[PUT /api/demandas/${params.id}] Error updating demanda:`, error)
    console.error(`[PUT /api/demandas/${params.id}] Error details:`, {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
    })
    
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error al actualizar la demanda' },
      { status: 500 }
    )
  }
}

