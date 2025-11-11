import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { EstampoGenerateSchema } from '@/lib/validations/rol-workspace'

export const dynamic = 'force-dynamic'

function replaceVariables(template: string, variables?: Record<string, string>) {
  if (!variables) return template
  let result = template
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replaceAll(`$${key}`, value ?? '')
  })
  return result
}

async function buildEstampoPdf(content: string) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const font = await doc.embedFont(StandardFonts.TimesRoman)

  const lines = content.split('\n')
  let y = 780

  lines.forEach(line => {
    if (y < 60) {
      y = 780
    }
    page.drawText(line, { x: 50, y, size: 12, font })
    y -= 18
  })

  const pdfBytes = await doc.save()
  return Buffer.from(pdfBytes).toString('base64')
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

    const officeIdStr = String(user.officeId)

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: officeIdStr,
        },
      },
      include: {
        rol: true,
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    const parsed = EstampoGenerateSchema.safeParse(await req.json())

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const data = parsed.data

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

    const template = estampo.contenido || 'Estampo generado para $rol'
    const filled = replaceVariables(template, {
      rol: diligencia.rol.rol,
      ...(data.variables ?? {}),
    })

    const pdfBase64 = await buildEstampoPdf(filled)

    const documento = await prisma.documento.create({
      data: {
        rolId: diligencia.rolId,
        diligenciaId: diligencia.id,
        estampoId: estampo.id,
        nombre: `Estampo ${estampo.nombre}`,
        tipo: 'Estampo',
        pdfId: pdfBase64,
        version: 1,
      },
    })

    await logAudit({
      userEmail: user.email,
      userId: user.id,
      officeId: officeIdStr,
      rolId: diligencia.rolId,
      tabla: 'Documento',
      accion: 'Generó estampo',
      diff: { diligenciaId: diligencia.id, estampoId: estampo.id, documentoId: documento.id },
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

