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
    
    const { rol, tribunalId, caratula, cuantia, abogadoId, ejecutados } = body

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

    // Create Demanda with ejecutados if provided
    // Use Prisma's cuid() for id generation (no manual crypto)
    console.log('[POST /api/demandas] Creating demanda...')
    const demanda = await prisma.demanda.create({
      data: {
        rol,
        tribunalId: tribunalIdInt, // Use validated Int tribunalId
        caratula,
        cuantia: cuantia ? parseFloat(cuantia) : 0,
        abogadoId: parseInt(abogadoId),
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

    if (process.env.NODE_ENV === 'development') {
      console.log(`[POST /api/demandas] ✅ Demanda created successfully:`, {
        id: demanda.id,
        rol: demanda.rol,
        officeId: demanda.officeId,
      })
    } else {
      console.log('[POST /api/demandas] Demanda created successfully:', demanda.id)
    }

    return NextResponse.json({ ok: true, data: demanda })
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

