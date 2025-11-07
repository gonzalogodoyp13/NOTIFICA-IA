// API route: /api/demandas
// GET: List all demandas for the current office
// POST: Create a new demanda
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { DemandaSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const demandas = await prisma.demanda.findMany({
      where: { officeId: user.officeId },
      include: {
        tribunal: {
          select: {
            id: true,
            nombre: true,
          },
        },
        abogado: {
          select: {
            id: true,
            nombre: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        ejecutados: {
          include: {
            comuna: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, data: demandas })
  } catch (error) {
    console.error('Error fetching demandas:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al obtener las demandas' },
      { status: 500 }
    )
  }
}

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
    
    const parsed = DemandaSchema.safeParse(body)

    if (!parsed.success) {
      console.log('[POST /api/demandas] Validation failed:', parsed.error.errors)
      const errorMessages = parsed.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ')
      return NextResponse.json(
        { ok: false, error: errorMessages },
        { status: 400 }
      )
    }

    console.log('[POST /api/demandas] Validation passed:', parsed.data)

    // Ensure the user's office exists (auto-create if missing)
    // This must happen BEFORE verifying tribunal/abogado since they depend on officeId
    let officeId = user.officeId
    const office = await prisma.office.findUnique({
      where: { id: officeId },
    })

    if (!office) {
      // Office doesn't exist - create it automatically
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
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[POST /api/demandas] Using existing office ID: ${officeId} (${office.nombre})`)
      }
    }

    // Verify tribunalId belongs to user's office
    const tribunal = await prisma.tribunal.findFirst({
      where: {
        id: parsed.data.tribunalId,
        officeId: officeId,
      },
    })

    if (!tribunal) {
      return NextResponse.json(
        { ok: false, error: 'Tribunal no encontrado o no pertenece a tu oficina' },
        { status: 400 }
      )
    }

    // Verify abogadoId belongs to user's office
    const abogado = await prisma.abogado.findFirst({
      where: {
        id: parsed.data.abogadoId,
        officeId: officeId,
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
      where: { rol: parsed.data.rol },
    })

    if (existingDemanda) {
      return NextResponse.json(
        { ok: false, error: 'El ROL ya existe' },
        { status: 400 }
      )
    }

    // Create demanda with ejecutados if provided
    console.log('[POST /api/demandas] Creating demanda...')
    const demanda = await prisma.demanda.create({
      data: {
        rol: parsed.data.rol,
        tribunalId: parsed.data.tribunalId,
        caratula: parsed.data.caratula,
        cuantia: parsed.data.cuantia,
        abogadoId: parsed.data.abogadoId,
        officeId: officeId,
        userId: user.id,
        ejecutados: parsed.data.ejecutados
          ? {
              create: parsed.data.ejecutados.map((ejecutado) => ({
                nombre: ejecutado.nombre,
                rut: ejecutado.rut,
                direccion: ejecutado.direccion,
                comunaId: ejecutado.comunaId,
                rvm: ejecutado.rvm,
              })),
            }
          : undefined,
      },
      include: {
        tribunal: {
          select: {
            id: true,
            nombre: true,
          },
        },
        abogado: {
          select: {
            id: true,
            nombre: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        ejecutados: {
          include: {
            comuna: {
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

    // Log CREATE_DEMANDA action
    try {
      await prisma.auditLog.create({
        data: {
          userEmail: user.email,
          action: `CREATE_DEMANDA: ROL ${demanda.rol} - ${demanda.caratula}`,
        },
      })
    } catch (auditError) {
      console.error('[POST /api/demandas] Error creating audit log:', auditError)
      // Don't fail the request if audit log fails
    }

    return NextResponse.json({ ok: true, data: demanda })
  } catch (error: any) {
    console.error('[POST /api/demandas] Error creating demanda:', error)
    console.error('[POST /api/demandas] Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
    })
    
    // Return more detailed error message
    const errorMessage = error?.message || 'Error al crear la demanda'
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    )
  }
}

