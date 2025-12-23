// API route: /api/procuradores
// GET: List all procuradores for the current office (optionally filtered by bancoId)
// POST: Create a new procurador (optionally link to banco)
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ProcuradorSchema } from '@/lib/zodSchemas'

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

    const { searchParams } = new URL(req.url)
    const bancoIdParam = searchParams.get('bancoId')

    if (bancoIdParam) {
      // Filter by bancoId
      const bancoId = parseInt(bancoIdParam)
      if (isNaN(bancoId)) {
        return NextResponse.json(
          { ok: false, message: 'bancoId inválido', error: 'bancoId inválido' },
          { status: 400 }
        )
      }

      // Validate banco exists and belongs to office
      const banco = await prisma.banco.findFirst({
        where: { id: bancoId, officeId: user.officeId },
      })

      if (!banco) {
        return NextResponse.json(
          { ok: false, message: 'Banco no encontrado', error: 'Banco no encontrado' },
          { status: 404 }
        )
      }

      // Get procuradores for this banco
      const procuradores = await prisma.procurador.findMany({
        where: {
          officeId: user.officeId,
          bancos: {
            some: {
              bancoId,
              officeId: user.officeId,
            },
          },
        },
        include: {
          abogado: {
            select: {
              id: true,
              nombre: true,
            },
          },
          bancos: {
            where: {
              bancoId,
              officeId: user.officeId,
            },
            select: {
              activo: true,
              alias: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      // Map response: convert bancos array to single bancoProcurador object
      const mapped = procuradores.map(p => ({
        id: p.id,
        nombre: p.nombre,
        email: p.email,
        telefono: p.telefono,
        notas: p.notas,
        abogadoId: p.abogadoId,
        abogado: p.abogado,
        activo: p.activo,
        bancoProcurador: p.bancos[0] ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }))

      return NextResponse.json({ ok: true, data: mapped })
    } else {
      // Get all procuradores for office
      const procuradores = await prisma.procurador.findMany({
        where: { officeId: user.officeId },
        include: {
          abogado: {
            select: {
              id: true,
              nombre: true,
            },
          },
          bancos: {
            select: {
              activo: true,
              alias: true,
              bancoId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return NextResponse.json({ ok: true, data: procuradores })
    }
  } catch (error) {
    console.error('Error fetching procuradores:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los procuradores'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'No autorizado', error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const parsed = ProcuradorSchema.safeParse(body)

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    // Normalize email: convert empty string to null
    const email = parsed.data.email === '' ? null : parsed.data.email

    // Validate abogadoId if provided
    if (parsed.data.abogadoId) {
      const abogado = await prisma.abogado.findFirst({
        where: {
          id: parsed.data.abogadoId,
          officeId: user.officeId,
        },
      })

      if (!abogado) {
        return NextResponse.json(
          { ok: false, message: 'Abogado no encontrado o no pertenece a tu oficina', error: 'Abogado no encontrado' },
          { status: 404 }
        )
      }
    }

    // Create procurador
    const procurador = await prisma.procurador.create({
      data: {
        officeId: user.officeId,
        nombre: parsed.data.nombre,
        email,
        telefono: parsed.data.telefono || null,
        notas: parsed.data.notas || null,
        abogadoId: parsed.data.abogadoId || null,
      },
    })

    // If bancoId provided, create link
    let bancoProcurador = null
    if (parsed.data.bancoId) {
      // Validate banco exists and belongs to office
      const banco = await prisma.banco.findFirst({
        where: {
          id: parsed.data.bancoId,
          officeId: user.officeId,
        },
      })

      if (!banco) {
        return NextResponse.json(
          { ok: false, message: 'Banco no encontrado o no pertenece a tu oficina', error: 'Banco no encontrado' },
          { status: 404 }
        )
      }

      // Check if link already exists
      const existing = await prisma.bancoProcurador.findFirst({
        where: {
          officeId: user.officeId,
          bancoId: parsed.data.bancoId,
          procuradorId: procurador.id,
        },
      })

      if (existing) {
        return NextResponse.json(
          { ok: false, message: 'Este procurador ya está vinculado a este banco', error: 'Ya está vinculado', errorCode: 'DUPLICATE' },
          { status: 409 }
        )
      }

      // Create link
      try {
        bancoProcurador = await prisma.bancoProcurador.create({
          data: {
            officeId: user.officeId,
            bancoId: parsed.data.bancoId,
            procuradorId: procurador.id,
            alias: parsed.data.alias || null,
            activo: true,
          },
        })
      } catch (error: any) {
        if (error.code === 'P2002') {
          return NextResponse.json(
            { ok: false, message: 'Este procurador ya está vinculado a este banco', error: 'Ya está vinculado', errorCode: 'DUPLICATE' },
            { status: 409 }
          )
        }
        throw error
      }
    }

    // Fetch procurador with relations
    const procuradorWithRelations = await prisma.procurador.findUnique({
      where: { id: procurador.id },
      include: {
        abogado: {
          select: {
            id: true,
            nombre: true,
          },
        },
        bancos: bancoProcurador
          ? {
              where: {
                id: bancoProcurador.id,
              },
              select: {
                activo: true,
                alias: true,
              },
            }
          : false,
      },
    })

    return NextResponse.json({ ok: true, data: procuradorWithRelations })
  } catch (error) {
    console.error('Error creating procurador:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el procurador'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

