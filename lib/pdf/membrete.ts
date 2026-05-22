import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { wrapText } from '@/lib/pdf/textLayout'

export type MembretePlacement = '1' | '2' | '3' | '4' | '5' | '6'
export type MembretePageSize = 'oficio' | 'carta'

export type MembreteVariables = {
  nombre: string
  direccion: string
  causa: string
  rol: string
  caratulado: string
  abogado: string
}

const PAGE_SIZES: Record<MembretePageSize, [number, number]> = {
  carta: [612, 792],
  oficio: [612, 1008],
}

function resolveBlockPlacement(
  pageWidth: number,
  pageHeight: number,
  placement: MembretePlacement
) {
  const marginX = 42
  const blockWidth = 252
  const blockHeight = 176
  const topY = pageHeight - 58
  const middleY = pageHeight / 2 + blockHeight / 2
  const bottomY = 238
  const leftX = marginX
  const rightX = pageWidth - marginX - blockWidth

  switch (placement) {
    case '2':
      return { x: rightX, y: topY, width: blockWidth, rotate: false }
    case '3':
      return { x: leftX, y: bottomY, width: blockWidth, rotate: false }
    case '4':
      return { x: rightX, y: bottomY, width: blockWidth, rotate: false }
    case '5':
      return { x: 56, y: middleY + 92, width: blockWidth, rotate: true }
    case '6':
      return { x: pageWidth - 56, y: middleY - blockWidth + 92, width: blockWidth, rotate: true }
    case '1':
    default:
      return { x: leftX, y: topY, width: blockWidth, rotate: false }
  }
}

export async function buildMembretePdf(
  variables: MembreteVariables,
  placement: MembretePlacement,
  pageSize: MembretePageSize
): Promise<string> {
  const doc = await PDFDocument.create()
  const page = doc.addPage(PAGE_SIZES[pageSize])
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const pageWidth = page.getSize().width
  const pageHeight = page.getSize().height
  const block = resolveBlockPlacement(pageWidth, pageHeight, placement)

  const fields = [
    { label: 'NOMBRE', value: variables.nombre },
    { label: 'DIRECCIÓN', value: variables.direccion },
    { label: 'CAUSA', value: variables.causa },
    { label: 'ROL N°:', value: variables.rol },
    { label: 'CARATULADO', value: variables.caratulado },
    { label: 'ABOGADO', value: variables.abogado },
  ]

  const labelSize = 8.5
  const valueSize = 8.5
  const lineGap = 11
  const labelWidth = 70
  let y = block.y

  const drawText = (text: string, x: number, textY: number, options: { bold?: boolean } = {}) => {
    page.drawText(text, {
      x,
      y: textY,
      size: options.bold ? labelSize : valueSize,
      font: options.bold ? fontBold : font,
      color: rgb(0, 0, 0),
      rotate: block.rotate ? degrees(90) : undefined,
    })
  }

  const stepDown = (amount: number) => {
    y -= amount
  }

  for (const field of fields) {
    const valueX = block.x + labelWidth
    drawText(field.label, block.x, y, { bold: true })

    const lines = wrapText(field.value || '-', block.width - labelWidth, font, valueSize)
    lines.forEach((line, index) => {
      if (line !== '__BLANK__') {
        drawText(line, valueX, y - index * lineGap)
      }
    })

    stepDown(Math.max(lineGap, lines.length * lineGap) + 2)
  }

  stepDown(10)
  drawText('Notifico a ud. lo siguiente:', block.x, y)

  const pdfBytes = await doc.save()
  return Buffer.from(pdfBytes).toString('base64')
}
