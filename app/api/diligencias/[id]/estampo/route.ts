import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { EstampoGenerateSchema } from '@/lib/validations/rol-workspace'
import { formatCuantiaCLP } from '@/lib/utils/cuantia'
import { formatDateToSpanishWords } from '@/lib/utils/dateFormat'
import { drawRolHeader, type HeaderData } from '@/lib/pdf/header'
import { replaceVariables } from '@/lib/estampos/text'
import { buildEstampoPdf } from '@/lib/estampos/pdf'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

// Type for diligencia with all relations
type DiligenciaWithRelations = NonNullable<
  Awaited<ReturnType<typeof prisma.diligencia.findFirst>>
>

function buildEstampoVariables(
  diligencia: DiligenciaWithRelations,
  dbUser: { officeName: string } | null
): Record<string, string> {
  const meta = diligencia.meta as Record<string, unknown> | null
  const ejecutadoId = meta?.ejecutadoId as string | undefined

  // Seleccionar ejecutado (por meta o primero disponible)
  const ejecutados = (diligencia as any).rol?.demanda?.ejecutados ?? []
  const ejecutado = ejecutadoId
    ? ejecutados.find((e: any) => e.id === ejecutadoId) ?? ejecutados[0]
    : ejecutados[0]

  // Datos del abogado
  const abogado = (diligencia as any).rol?.demanda?.abogados
  const banco = abogado?.banco

  // Datos del tribunal
  const tribunal = (diligencia as any).rol?.tribunal

  // Fecha y hora
  const fechaEjecucion = meta?.fechaEjecucion
    ? new Date(meta.fechaEjecucion as string)
    : diligencia.fecha
  const horaEjecucion = (meta?.horaEjecucion as string) ?? ''

  // Cuantía formateada
  const cuantiaRaw = (diligencia as any).rol?.demanda?.cuantia
  const cuantiaFormatted = cuantiaRaw ? formatCuantiaCLP(cuantiaRaw) : ''

  // Construir mapa de variables
  return {
    // Ejecutado
    nombre_ejecutado: ejecutado?.nombre ?? '',
    rut_ejecutado: ejecutado?.rut ?? '',
    direccion_ejecutado: [ejecutado?.direccion, ejecutado?.comunas?.nombre]
      .filter(Boolean)
      .join(', '),
    solo_comuna_ejecutado: ejecutado?.comunas?.nombre ?? '',

    // Abogado
    abogado_nombre: abogado?.nombre ?? '',
    abogado_direccion: [abogado?.direccion, abogado?.comuna]
      .filter(Boolean)
      .join(', '),

    // ROL y Tribunal
    rol: (diligencia as any).rol?.rol ?? '',
    tribunal: tribunal?.nombre ?? '',

    // Carátula
    caratula: [banco?.nombre, ejecutado?.nombre].filter(Boolean).join(' / '),

    // Montos
    cuantia: cuantiaFormatted,
    monto_ejecutado: cuantiaFormatted,

    // Fecha y hora
    fecha_palabras_diligencia: formatDateToSpanishWords(fechaEjecucion),
    hora_diligencia: horaEjecucion,

    // Receptor
    receptor_nombre: dbUser?.officeName ?? 'Receptor Judicial',

    // Placeholders vacíos (para futuro uso)
    n_operacion: (meta?.n_operacion as string) ?? '',
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    // Get user with officeName from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { officeName: true },
    })

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: user.officeId,
        },
      },
      include: {
        rol: {
          include: {
            tribunal: {
              select: {
                id: true,
                nombre: true,
              },
            },
            demanda: {
              include: {
                abogados: {
                  include: {
                    banco: true,
                  },
                },
                ejecutados: {
                  include: {
                    comunas: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const raw = await req.json().catch(() => ({}))
    const notificacionId = typeof raw?.notificacionId === 'string' ? raw.notificacionId : null

    const parsed = EstampoGenerateSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const data = parsed.data

    if (notificacionId) {
      const noti = await prisma.notificacion.findFirst({
        where: { id: notificacionId, diligenciaId: diligencia.id },
        select: { id: true },
      })

      if (!noti) {
        return NextResponse.json({ ok: false, error: 'Notificación no encontrada' }, { status: 404 })
      }
    }

    const estampo = await prisma.estampo.findFirst({
      where: {
        id: data.estampoId,
        officeId: user.officeId,
      },
    })

    if (!estampo) {
      return NextResponse.json(
        { ok: false, error: 'Estampo no encontrado en tu oficina' },
        { status: 404 }
      )
    }

    const template = data.contenidoPersonalizado
      ? data.contenidoPersonalizado
      : (estampo.contenido || 'Estampo generado para $rol')

    // Build complete variable map from diligencia data
    const variableMap = buildEstampoVariables(diligencia, dbUser)
    const filled = replaceVariables(template, variableMap)

    // Get ejecutadoNombre for header (from variableMap)
    const ejecutadoNombre = variableMap.nombre_ejecutado || null

    // Load signature and seal images
    const firmaPath = path.resolve('./public/mock-firma.png')
    const selloPath = path.resolve('./public/mock-sello.png')
    const officeImages: { firma?: Uint8Array; sello?: Uint8Array } = {}

    if (fs.existsSync(firmaPath)) {
      officeImages.firma = await fs.promises.readFile(firmaPath)
    }

    if (fs.existsSync(selloPath)) {
      officeImages.sello = await fs.promises.readFile(selloPath)
    }

    // Extract header data
    const headerData: HeaderData = {
      receptorNombre: dbUser?.officeName ?? 'Receptor Judicial', // User authenticated (receptor)
      tribunalNombre: diligencia.rol.tribunal?.nombre ?? null,
      rolNumero: diligencia.rol.rol,
      bancoNombre: diligencia.rol.demanda?.abogados?.banco?.nombre ?? null,
      ejecutadoNombre,
    }

    const pdfBase64 = await buildEstampoPdf(filled, headerData, officeImages)

    const documento = await prisma.documento.create({
      data: {
        rolId: diligencia.rolId,
        diligenciaId: diligencia.id,
        notificacionId: notificacionId ?? null,
        estampoId: estampo.id,
        nombre: `Estampo ${estampo.nombre}`,
        tipo: 'Estampo',
        pdfId: pdfBase64,
        version: 1,
      },
    })

    return NextResponse.json({ ok: true, data: documento })
  } catch (error) {
    console.error('Error generando estampo:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al generar el estampo' },
      { status: 500 }
    )
  }
}

