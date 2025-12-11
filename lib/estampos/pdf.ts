import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { wrapText } from '@/lib/pdf/textLayout'
import { embedSignatureImages } from '@/lib/pdf/imageUtils'
import { drawRolHeader, type HeaderData } from '@/lib/pdf/header'

/**
 * Genera un PDF de estampo con el contenido y header especificados
 * Reutiliza la misma lógica del route legacy para mantener consistencia
 */
export async function buildEstampoPdf(
  content: string,
  headerData: HeaderData,
  officeImages?: { firma?: Uint8Array; sello?: Uint8Array }
): Promise<string> {
  const pdf = await PDFDocument.create()
  let page = pdf.addPage([595, 842]) // A4 size
  const margin = 50
  const font = await pdf.embedFont(StandardFonts.TimesRoman)
  const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const fontSize = 12
  const lineHeight = fontSize + 4
  let y = page.getSize().height - margin

  // Draw header on first page
  y = drawRolHeader(pdf, page, headerData, { font, fontBold }, y, margin)

  // Wrap text for proper line breaking
  const lines = wrapText(
    content,
    page.getSize().width - margin * 2,
    font,
    fontSize
  )

  // Draw content lines with pagination
  for (const line of lines) {
    if (y <= margin + 50) {
      page = pdf.addPage()
      y = page.getSize().height - margin
      // Header only appears on first page, so no header on subsequent pages
    }

    if (line === '__BLANK__') {
      y -= fontSize * 1.5
      continue
    }

    const adjustedText = await embedSignatureImages(
      pdf,
      page,
      line,
      y,
      officeImages || {}
    )

    if (adjustedText.trim()) {
      page.drawText(adjustedText, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      })
    }

    y -= lineHeight
  }

  const pdfBytes = await pdf.save()
  return Buffer.from(pdfBytes).toString('base64')
}

