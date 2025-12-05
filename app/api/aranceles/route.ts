// API route: /api/aranceles
// GET: List aranceles for a banco (with optional abogadoId filter)
// POST: Create a new arancel
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ArancelSchema, parseArancelMonto } from '@/lib/zodSchemas'

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
    const abogadoIdParam = searchParams.get('abogadoId')

    if (!bancoIdParam) {
      return NextResponse.json(
        { ok: false, message: 'bancoId es requerido', error: 'bancoId es requerido' },
        { status: 400 }
      )
    }

    const bancoId = parseInt(bancoIdParam)
    if (isNaN(bancoId)) {
      return NextResponse.json(
        { ok: false, message: 'bancoId inválido', error: 'bancoId inválido' },
        { status: 400 }
      )
    }

    // Validar que el banco existe y pertenece a la oficina
    const banco = await prisma.banco.findFirst({
      where: { id: bancoId, officeId: user.officeId },
    })

    if (!banco) {
      return NextResponse.json(
        { ok: false, message: 'Banco no encontrado', error: 'Banco no encontrado' },
        { status: 404 }
      )
    }

    // Construir query where
    const where: any = {
      officeId: user.officeId,
      bancoId: bancoId,
    }

    // Manejar abogadoId
    if (abogadoIdParam !== null && abogadoIdParam !== undefined) {
      if (abogadoIdParam === 'null' || abogadoIdParam === '') {
        // Solo aranceles banco-wide
        where.abogadoId = null
      } else {
        const abogadoId = parseInt(abogadoIdParam)
        if (isNaN(abogadoId)) {
          return NextResponse.json(
            { ok: false, message: 'abogadoId inválido', error: 'abogadoId inválido' },
            { status: 400 }
          )
        }

        // Verificar que abogado pertenece al banco
        const abogadoBanco = await prisma.abogadoBanco.findFirst({
          where: {
            abogadoId,
            bancoId,
            officeId: user.officeId,
          },
        })

        if (!abogadoBanco) {
          return NextResponse.json(
            { ok: false, message: 'El abogado seleccionado no pertenece a este banco', error: 'Abogado no pertenece al banco' },
            { status: 400 }
          )
        }

        where.abogadoId = abogadoId
      }
    }
    // Si abogadoId es undefined, retorna ambos (banco-wide + abogado-specific)

    // Query con includes
    const aranceles = await prisma.arancel.findMany({
      where,
      include: {
        estampo: {
          select: { id: true, nombre: true, tipo: true, activo: true },
        },
        abogado: abogadoIdParam === undefined
          ? {
              select: { id: true, nombre: true },
            }
          : false,
      },
      orderBy: [
        { abogadoId: 'asc' }, // NULL primero (banco-wide), luego abogados
        { estampo: { nombre: 'asc' } },
      ],
    })

    return NextResponse.json({ ok: true, data: aranceles })
  } catch (error) {
    console.error('Error fetching aranceles:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los aranceles'
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

    // Parsear monto antes de validar
    let montoParsed: number
    if (typeof body.monto === 'string') {
      montoParsed = parseArancelMonto(body.monto)
    } else {
      montoParsed = Math.floor(body.monto || 0)
    }

    // Validar con Zod
    const parsed = ArancelSchema.safeParse({
      ...body,
      monto: montoParsed,
    })

    if (!parsed.success) {
      const errorMessage = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { ok: false, message: errorMessage, error: errorMessage },
        { status: 400 }
      )
    }

    // Verificar banco
    const banco = await prisma.banco.findFirst({
      where: { id: parsed.data.bancoId, officeId: user.officeId },
    })

    if (!banco) {
      return NextResponse.json(
        { ok: false, message: 'Banco no encontrado o no pertenece a tu oficina', error: 'Banco no encontrado' },
        { status: 400 }
      )
    }

    // Verificar estampo
    const estampo = await prisma.estampo.findFirst({
      where: {
        id: parsed.data.estampoId,
        officeId: user.officeId,
        activo: true,
      },
    })

    if (!estampo) {
      return NextResponse.json(
        { ok: false, message: 'Estampo no encontrado o está inactivo', error: 'Estampo no encontrado o inactivo' },
        { status: 400 }
      )
    }

    // Si abogadoId está presente, verificar relación
    if (parsed.data.abogadoId) {
      const abogadoBanco = await prisma.abogadoBanco.findFirst({
        where: {
          abogadoId: parsed.data.abogadoId,
          bancoId: parsed.data.bancoId,
          officeId: user.officeId,
        },
      })

      if (!abogadoBanco) {
        return NextResponse.json(
          { ok: false, message: 'El abogado seleccionado no pertenece a este banco', error: 'Abogado no pertenece al banco' },
          { status: 400 }
        )
      }
    }

    // Verificar unicidad (evitar duplicados)
    const existing = await prisma.arancel.findFirst({
      where: {
        officeId: user.officeId,
        bancoId: parsed.data.bancoId,
        abogadoId: parsed.data.abogadoId ?? null,
        estampoId: parsed.data.estampoId,
      },
    })

    if (existing) {
      return NextResponse.json(
        { ok: false, message: 'Ya existe un arancel para esta combinación de Banco/Abogado/Estampo', error: 'Duplicado' },
        { status: 400 }
      )
    }

    // Crear arancel
    try {
      const arancel = await prisma.arancel.create({
        data: {
          officeId: user.officeId,
          bancoId: parsed.data.bancoId,
          abogadoId: parsed.data.abogadoId ?? null,
          estampoId: parsed.data.estampoId,
          monto: montoParsed,
          activo: parsed.data.activo ?? true,
        },
        include: {
          estampo: {
            select: { id: true, nombre: true, tipo: true },
          },
          abogado: parsed.data.abogadoId
            ? {
                select: { id: true, nombre: true },
              }
            : false,
        },
      })

      return NextResponse.json({ ok: true, data: arancel })
    } catch (error: any) {
      // Capturar error de constraint violation
      if (error.code === 'P2002') {
        return NextResponse.json(
          {
            ok: false,
            message: 'Ya existe un arancel para esta combinación de Banco/Abogado/Estampo',
            error: 'Duplicado',
          },
          { status: 400 }
        )
      }
      throw error
    }
  } catch (error) {
    console.error('Error creating arancel:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al crear el arancel'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }
}

