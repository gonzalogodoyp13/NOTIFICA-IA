import { withApiUser } from '@/lib/api/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { replaceVariables } from '@/lib/estampos/text'
import { loadOfficePdfConfig } from '@/lib/pdf/officeConfig'
import type { EstampoEjecutado } from '@/lib/estampos/runtime'
import {
  buildCustomEstampoVariables,
  customEstampoDiligenciaInclude,
} from '@/lib/estampos/legacy'

export const dynamic = 'force-dynamic'

const PreviewCustomEstampoSchema = z.object({
  estampoId: z.string().min(1),
  notificacionId: z.string().min(1).optional(),
  contenidoPersonalizado: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withApiUser(req, 'post.diligencias.id.estampo.preview', async user => {
  try {

    const body = await req.json().catch(() => ({}))
    const parsed = PreviewCustomEstampoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Datos invalidos', details: parsed.error.format() },
        { status: 400 }
      )
    }

    const { estampoId, notificacionId } = parsed.data

    const [diligencia, estampo] = await Promise.all([
      prisma.diligencia.findFirst({
        where: {
          id: params.id,
          rol: {
            officeId: user.officeId,
          },
        },
        include: customEstampoDiligenciaInclude,
      }),
      prisma.estampo.findFirst({
        where: {
          id: estampoId,
          officeId: user.officeId,
        },
      }),
    ])

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    if (!estampo) {
      return NextResponse.json(
        { ok: false, error: 'Estampo no encontrado en tu oficina' },
        { status: 404 }
      )
    }

    let ejecutadoFromNotificacion: EstampoEjecutado | undefined

    if (notificacionId) {
      const noti = await prisma.notificacion.findFirst({
        where: { id: notificacionId, diligenciaId: diligencia.id },
        include: {
          ejecutado: {
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

      if (!noti) {
        return NextResponse.json({ ok: false, error: 'Notificacion no encontrada' }, { status: 404 })
      }

      if (!noti.ejecutadoId || !noti.ejecutado) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Esta notificacion requiere seleccionar un ejecutado antes de generar documentos.',
          },
          { status: 400 }
        )
      }

      ejecutadoFromNotificacion = noti.ejecutado
    }

    const officePdfConfig = await loadOfficePdfConfig(user.officeId, user.officeName)
    const variableMap = buildCustomEstampoVariables(
      diligencia,
      user,
      officePdfConfig,
      ejecutadoFromNotificacion
    )
    const template = parsed.data.contenidoPersonalizado ?? estampo.contenido ?? 'Estampo generado para $rol'

    return NextResponse.json({
      ok: true,
      data: {
        renderedText: replaceVariables(template, variableMap),
        variables: variableMap,
      },
    })
  } catch (error) {
    console.error('Error en POST /estampo/preview:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al generar vista previa' },
      { status: 500 }
    )
  }

  })
}
