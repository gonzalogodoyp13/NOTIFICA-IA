import { withApiUser } from '@/lib/api/server'
// API route: /api/aranceles
// GET: List aranceles for a banco (with optional abogadoId filter)
// POST: Create a new arancel
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ArancelSchema, parseArancelMonto } from '@/lib/zodSchemas'
import { recordCriticalEvent } from '@/lib/audit/activityEvent'
import { bumpOfficeCacheRevision } from '@/lib/cache/officeCacheRevision'
import { invalidateOfficeCaches } from '@/lib/cache/officeCache'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.aranceles', async user => {
  try {

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

    // Query con select (incluye estampoBaseCategoria)
    const aranceles = await prisma.arancel.findMany({
      where,
      select: {
        id: true,
        bancoId: true,
        abogadoId: true,
        estampoId: true,
        estampoBaseCategoria: true,
        monto: true,
        activo: true,
        createdAt: true,
        updatedAt: true,
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
        { abogadoId: 'asc' },
        { estampoId: 'asc' },
        { estampoBaseCategoria: 'asc' },
      ],
    })

    // Mapear respuesta con tipo (sin generar labels aquí - UI los obtiene del endpoint)
    const mapped = aranceles.map(a => ({
      ...a,
      tipo: a.estampoId ? 'custom' : 'wizard',
    }))

    return NextResponse.json({ ok: true, data: mapped })
  } catch (error) {
    console.error('Error fetching aranceles:', error)
    const errorMessage = error instanceof Error ? error.message : 'Error al obtener los aranceles'
    return NextResponse.json(
      { ok: false, message: errorMessage, error: errorMessage },
      { status: 500 }
    )
  }

  })
}

export async function POST(req: NextRequest) {
  return withApiUser(req, 'post.aranceles', async user => {
  try {

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

    // Validación condicional según tipo
    if (parsed.data.estampoId) {
      // Custom estampo: validar que existe
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
    } else if (parsed.data.estampoBaseCategoria) {
      // WIZARD: validar categoria existe en EstampoBase activos
      const categoriaExists = await prisma.estampoBase.findFirst({
        where: {
          categoria: parsed.data.estampoBaseCategoria,
          isActive: true,
        },
      })
      if (!categoriaExists) {
        return NextResponse.json(
          { ok: false, message: 'Categoría wizard no encontrada o está inactiva', error: 'Categoría no encontrada' },
          { status: 400 }
        )
      }
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

    // Verificar unicidad (adaptar para ambos tipos)
    const existing = await prisma.arancel.findFirst({
      where: parsed.data.estampoId
        ? {
            officeId: user.officeId,
            bancoId: parsed.data.bancoId,
            abogadoId: parsed.data.abogadoId ?? null,
            estampoId: parsed.data.estampoId,
          }
        : {
            officeId: user.officeId,
            bancoId: parsed.data.bancoId,
            abogadoId: parsed.data.abogadoId ?? null,
            estampoBaseCategoria: parsed.data.estampoBaseCategoria,
          },
    })

    if (existing) {
      return NextResponse.json(
        { 
          ok: false, 
          message: 'Ya existe un arancel para esta combinación de Banco/Abogado/Estampo', 
          error: 'Duplicado',
          errorCode: 'DUPLICATE'
        },
        { status: 400 }
      )
    }

    // Crear arancel
    try {
      const { arancel, cacheRevision } = await prisma.$transaction(async tx => {
       const created = await tx.arancel.create({
        data: {
          officeId: user.officeId,
          bancoId: parsed.data.bancoId,
          abogadoId: parsed.data.abogadoId ?? null,
          estampoId: parsed.data.estampoId ?? null,
          estampoBaseCategoria: parsed.data.estampoBaseCategoria ?? null,
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
       await recordCriticalEvent(tx, user, {
         eventType: 'settings.tariff.created', module: 'settings', result: 'success',
         recordType: 'Arancel', recordId: created.id, description: 'Arancel creado.',
         metadata: { tariffId: created.id, amount: Number(created.monto), active: created.activo, bankId: created.bancoId },
       })
       const cacheRevision = await bumpOfficeCacheRevision(tx, user.officeId)
       return { arancel: created, cacheRevision }
      })
      invalidateOfficeCaches(user.officeId)

      return NextResponse.json({ ok: true, data: arancel, cacheRevision })
    } catch (error: any) {
      // Capturar error de constraint violation
      if (error.code === 'P2002') {
        return NextResponse.json(
          {
            ok: false,
            message: 'Ya existe un arancel para esta combinación de Banco/Abogado/Estampo',
            error: 'Duplicado',
            errorCode: 'DUPLICATE'
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

  })
}
