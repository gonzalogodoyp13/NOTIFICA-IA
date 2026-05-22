import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { buildMembretePdf } from '@/lib/pdf/membrete'
import { MembreteGenerateSchema } from '@/lib/validations/rol-workspace'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const raw = await req.json().catch(() => ({}))
    const parsed = MembreteGenerateSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const data = parsed.data

    const rol = await prisma.rolCausa.findFirst({
      where: {
        id: params.id,
        officeId: user.officeId,
      },
      include: {
        tribunal: {
          select: {
            nombre: true,
          },
        },
        demanda: {
          include: {
            abogados: {
              select: {
                nombre: true,
              },
            },
            ejecutados: {
              include: {
                comunas: {
                  select: {
                    nombre: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!rol || !rol.demanda) {
      return NextResponse.json(
        { ok: false, error: 'Rol no encontrado o sin demanda asociada' },
        { status: 404 }
      )
    }

    const ejecutado = rol.demanda.ejecutados.find(item => item.id === data.ejecutadoId)

    if (!ejecutado) {
      return NextResponse.json(
        { ok: false, error: 'Ejecutado no encontrado para este rol' },
        { status: 404 }
      )
    }

    const direccion = [ejecutado.direccion, ejecutado.comunas?.nombre]
      .filter(Boolean)
      .join(', ')

    const pdfBase64 = await buildMembretePdf(
      {
        nombre: ejecutado.nombre,
        direccion,
        causa: [rol.tribunal?.nombre, rol.rol].filter(Boolean).join(' / '),
        rol: rol.rol,
        caratulado: rol.demanda.caratula,
        abogado: rol.demanda.abogados?.nombre ?? '',
      },
      data.placement,
      data.pageSize
    )

    const documento = await prisma.documento.create({
      data: {
        rolId: rol.id,
        nombre: `Membrete ${ejecutado.nombre}`,
        tipo: 'Membrete',
        pdfId: pdfBase64,
        version: 1,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        id: documento.id,
        nombre: documento.nombre,
        tipo: documento.tipo,
        version: documento.version,
        hasPdf: !!documento.pdfId,
        createdAt: documento.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error generando membrete:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al generar el membrete' },
      { status: 500 }
    )
  }
}
