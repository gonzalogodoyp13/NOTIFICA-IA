// API route: /api/demandas
// POST: Create a new Demanda with ejecutados (Phase 3)
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    console.log('[POST /api/demandas] Request received')
    
    const user = await getCurrentUserWithOffice()

    if (!user) {
      console.log('[POST /api/demandas] Unauthorized - no user')
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    console.log('[POST /api/demandas] User authenticated:', { id: user.id, email: user.email, officeId: user.officeId })

    const body = await req.json()
    console.log('[POST /api/demandas] Request body:', JSON.stringify(body, null, 2))
    
    const { rol, tribunalId, caratula, cuantia, abogadoId, materiaId, ejecutados } = body

    // Validate required fields
    if (!rol || !tribunalId || !caratula || !abogadoId) {
      return NextResponse.json(
        { ok: false, error: 'rol, tribunalId, caratula y abogadoId son requeridos' },
        { status: 400 }
      )
    }

    // Ensure office exists (auto-create if missing)
    let officeId = user.officeId
    const office = await prisma.office.findUnique({
      where: { id: officeId },
    })

    if (!office) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[POST /api/demandas] Office ID ${officeId} not found, creating default office...`)
      }
      
      const newOffice = await prisma.office.create({
        data: {
          nombre: 'Oficina Principal',
        },
      })
      
      officeId = newOffice.id
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[POST /api/demandas] ✅ Created default office with ID: ${officeId}`)
      }
    }

    // Verify tribunalId belongs to user's office (Phase 3: tribunales table with Int id)
    // Parse tribunalId as integer (should already be a number, but ensure it)
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
        officeId: user.officeId, // Int officeId
      },
    })

    if (!tribunal) {
      return NextResponse.json(
        { ok: false, error: 'Tribunal no encontrado o no pertenece a tu oficina' },
        { status: 400 }
      )
    }

    // Verify abogadoId belongs to user's office (Phase 3: abogados table with Int id)
    const abogado = await prisma.abogado.findFirst({
      where: {
        id: parseInt(abogadoId),
        officeId: user.officeId, // Int officeId
      },
    })

    if (!abogado) {
      return NextResponse.json(
        { ok: false, error: 'Abogado no encontrado o no pertenece a tu oficina' },
        { status: 400 }
      )
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

    // Check if ROL already exists
    const existingDemanda = await prisma.demanda.findUnique({
      where: { rol },
    })

    if (existingDemanda) {
      return NextResponse.json(
        { ok: false, error: 'El ROL ya existe' },
        { status: 400 }
      )
    }

    // Helper function to find or create Tribunal from tribunales
    const findOrCreateTribunal = async (tribunalesId: number, officeId: number) => {
      // First, try to find existing Tribunal with same name and officeId
      const tribunalesRecord = await prisma.tribunales.findUnique({
        where: { id: tribunalesId },
      })

      if (!tribunalesRecord) {
        throw new Error('Tribunal no encontrado')
      }

      // Try to find existing Tribunal with same nombre and officeId
      let tribunal = await prisma.tribunal.findFirst({
        where: {
          nombre: tribunalesRecord.nombre,
          officeId: officeId,
        },
      })

      // If not found, create new Tribunal
      if (!tribunal) {
        tribunal = await prisma.tribunal.create({
          data: {
            nombre: tribunalesRecord.nombre,
            direccion: tribunalesRecord.direccion,
            comuna: tribunalesRecord.comuna,
            officeId: officeId,
          },
        })
        console.log(`[POST /api/demandas] Created new Tribunal:`, { id: tribunal.id, nombre: tribunal.nombre })
      }

      return tribunal
    }

    // Create Demanda and RolCausa in a transaction
    console.log('[POST /api/demandas] Creating demanda and rolCausa...')
    
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Demanda
      const demanda = await tx.demanda.create({
        data: {
          rol,
          tribunalId: tribunalIdInt, // Use validated Int tribunalId
          caratula,
          cuantia: cuantia ? parseFloat(cuantia) : 0,
          abogadoId: parseInt(abogadoId),
          materiaId: materiaId ? parseInt(materiaId) : null,
          officeId,
          userId: user.id,
          ejecutados: ejecutados && ejecutados.length > 0 ? {
            create: ejecutados.map((ej: any) => ({
              nombre: ej.nombre,
              rut: ej.rut,
              direccion: ej.direccion || null,
              comunaId: ej.comunaId ? parseInt(ej.comunaId) : null,
            })),
          } : undefined,
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
      })

      // 2. Find or create Tribunal (String ID) from tribunales (Int ID)
      const tribunal = await findOrCreateTribunal(tribunalIdInt, officeId)

      // 3. Check if RolCausa already exists (should not, but safety check)
      const existingRolCausa = await tx.rolCausa.findUnique({
        where: { id: demanda.id },
      })

      if (existingRolCausa) {
        console.log(`[POST /api/demandas] ⚠️ RolCausa already exists for demanda.id ${demanda.id}, updating...`)
        // Update existing RolCausa
        await tx.rolCausa.update({
          where: { id: demanda.id },
          data: {
            demandaId: demanda.id,
            rol: demanda.rol,
            officeId: demanda.officeId,
            tribunalId: tribunal.id,
            estado: 'pendiente',
          },
        })
      } else {
        // 4. Create RolCausa with the same ID as Demanda
        await tx.rolCausa.create({
          data: {
            id: demanda.id, // Same ID as Demanda
            demandaId: demanda.id, // Auto-reference
            rol: demanda.rol,
            officeId: demanda.officeId,
            tribunalId: tribunal.id, // String ID from Tribunal
            estado: 'pendiente',
            createdAt: demanda.createdAt,
          },
        })
        console.log(`[POST /api/demandas] ✅ Created RolCausa with id: ${demanda.id}`)
      }

      return demanda
    })

    const demanda = result

    if (process.env.NODE_ENV === 'development') {
      console.log(`[POST /api/demandas] ✅ Demanda created successfully:`, {
        id: demanda.id,
        rol: demanda.rol,
        officeId: demanda.officeId,
        rolId: demanda.id, // Same as demanda.id
      })
    } else {
      console.log('[POST /api/demandas] Demanda created successfully:', demanda.id)
    }

    // Return response with rolId for frontend
    return NextResponse.json({ 
      ok: true, 
      data: {
        ...demanda,
        rolId: demanda.id, // Same ID as demanda.id for frontend navigation
      }
    })
  } catch (error: any) {
    console.error('[POST /api/demandas] Error creating demanda:', error)
    console.error('[POST /api/demandas] Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
    })
    
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error al crear la demanda' },
      { status: 500 }
    )
  }
}

