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
  placement: MembretePlacement,
  blockWidth: number,
  blockHeight: number,
  ascent: number
) {
  const margin = 18
  const topY = pageHeight - margin - ascent
  const bottomY = margin + blockHeight - ascent
  const leftX = margin
  const rightX = pageWidth - margin - blockWidth

  switch (placement) {
    case '2':
      return { x: rightX, y: topY, width: blockWidth, rotate: false }
    case '3':
      return { x: leftX, y: bottomY, width: blockWidth, rotate: false }
    case '4':
      return { x: rightX, y: bottomY, width: blockWidth, rotate: false }
    case '5':
      return { x: margin + ascent, y: (pageHeight - blockWidth) / 2, rotate: true }
    case '6':
      return { x: pageWidth - margin - blockHeight + ascent, y: (pageHeight - blockWidth) / 2, rotate: true }
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

  const fields = [
    { label: 'NOMBRE', value: variables.nombre },
    { label: 'DIRECCIÓN', value: variables.direccion },
    { label: 'CAUSA:', value: `${variables.causa || '-'} / ROL N°:${variables.rol || '-'}` },
    { label: 'CARATULADO', value: variables.caratulado },
    { label: 'ABOGADO', value: variables.abogado },
  ]

  const labelSize = 10.2
  const valueSize = 10.2
  const lineGap = 11.4
  const labelWidth = 84
  const rows = fields.map(field => ({
    ...field,
    lines: wrapText(field.value || '-', 360 - labelWidth, font, valueSize),
  }))
  const closingText = 'Notifico a ud. lo siguiente:'
  const lineCount = rows.reduce((count, field) => count + field.lines.length, 0)
  const ascent = Math.max(
    font.heightAtSize(valueSize, { descender: false }),
    fontBold.heightAtSize(labelSize, { descender: false })
  )
  const descent = Math.max(
    font.heightAtSize(valueSize) - font.heightAtSize(valueSize, { descender: false }),
    fontBold.heightAtSize(labelSize) - fontBold.heightAtSize(labelSize, { descender: false })
  )
  const blockWidth = Math.max(
    font.widthOfTextAtSize(closingText, valueSize),
    ...rows.flatMap(field => [
      fontBold.widthOfTextAtSize(field.label, labelSize),
      ...field.lines.map(line => labelWidth + font.widthOfTextAtSize(line === '__BLANK__' ? '' : line, valueSize)),
    ])
  )
  const blockHeight = ascent + lineCount * lineGap + descent
  const block = resolveBlockPlacement(pageWidth, pageHeight, placement, blockWidth, blockHeight, ascent)
  let y = 0

  const drawText = (text: string, x: number, textY: number, options: { bold?: boolean } = {}) => {
    page.drawText(text, {
      // Rotate the entire local layout, including columns and row advances.
      x: block.rotate ? block.x - textY : block.x + x,
      y: block.rotate ? block.y + x : block.y + textY,
      size: options.bold ? labelSize : valueSize,
      font: options.bold ? fontBold : font,
      color: rgb(0, 0, 0),
      rotate: block.rotate ? degrees(90) : undefined,
    })
  }

  const stepDown = (amount: number) => {
    y -= amount
  }

  for (const field of rows) {
    const valueX = labelWidth
    drawText(field.label, 0, y, { bold: true })

    const lines = field.lines
    lines.forEach((line, index) => {
      if (line !== '__BLANK__') {
        drawText(line, valueX, y - index * lineGap)
      }
    })

    stepDown(lines.length * lineGap)
  }

  drawText(closingText, 0, y)

  const pdfBytes = await doc.save()
  return Buffer.from(pdfBytes).toString('base64')
}
