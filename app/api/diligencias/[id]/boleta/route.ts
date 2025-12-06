import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { BoletaGenerateSchema } from '@/lib/validations/rol-workspace'

export const dynamic = 'force-dynamic'

async function buildReciboPdf(params: {
  rol: string
  diligenciaId: string
  monto: number
  medio: string
  referencia?: string
  variables?: Record<string, string>
}) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const { rol, diligenciaId, monto, medio, referencia, variables } = params

  const lines = [
    'Recibo de diligencia',
    `ROL: ${rol}`,
    `Diligencia: ${diligenciaId}`,
    `Monto: $${monto.toLocaleString('es-CL')}`,
    `Medio de pago: ${medio}`,
    referencia ? `Referencia: ${referencia}` : null,
  ].filter(Boolean) as string[]

  const custom = variables
    ? Object.entries(variables).map(([key, value]) => `${key}: ${value}`)
    : []

  let y = 780

  page.drawText('Recibo de diligencia', {
    x: 50,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  })
  y -= 40

  ;[...lines.slice(1), ...custom].forEach(line => {
    page.drawText(line, {
      x: 50,
      y,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    })
    y -= 20
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

    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: user.officeId,
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

    const parsed = BoletaGenerateSchema.safeParse(await req.json())

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
    }

    const data = parsed.data

    const pdfBase64 = await buildReciboPdf({
      rol: diligencia.rol.rol,
      diligenciaId: diligencia.id,
      monto: data.monto,
      medio: data.medio,
      referencia: data.referencia,
      variables: data.variables,
    })

    const documento = await prisma.documento.create({
      data: {
        rolId: diligencia.rolId,
        diligenciaId: diligencia.id,
        nombre: `Boleta ${new Date().toISOString()}`,
        tipo: 'Recibo',
        pdfId: pdfBase64,
        version: 1,
      },
    })

    await prisma.recibo.create({
      data: {
        rolId: diligencia.rolId,
        monto: data.monto,
        medio: data.medio,
        ref: data.referencia ?? null,
      },
    })

    return NextResponse.json({ ok: true, data: documento })
  } catch (error) {
    console.error('Error generando boleta:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al generar la boleta' },
      { status: 500 }
    )
  }
}

