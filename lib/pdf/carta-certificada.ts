import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import type { CartaFormato } from '../validations/carta-certificada'

const SMALL = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
function numberInWords(n: number): string {
  if (n < 30) return SMALL[n]
  if (n < 100) return ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'][Math.floor(n / 10)] + (n % 10 ? ` y ${SMALL[n % 10]}` : '')
  if (n === 100) return 'cien'
  if (n < 1000) return ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'][Math.floor(n / 100)] + (n % 100 ? ` ${numberInWords(n % 100)}` : '')
  return `${n < 2000 ? '' : `${numberInWords(Math.floor(n / 1000))} `}mil${n % 1000 ? ` ${numberInWords(n % 1000)}` : ''}`
}

export function cartaDateInWords(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${numberInWords(day)} de ${months[month - 1]} de ${numberInWords(year)}`
}

export type CartaVariables = {
  receptorNombre: string; receptorDireccion: string; nombre: string; direccion: string;
  comuna: string; fecha: string; formato: CartaFormato; detalle: string;
  rol: string; caratula: string; tribunal: string;
}

export function cartaParagraph(data: CartaVariables): string {
  const descriptions: Record<CartaFormato, string> = {
    art44: 'Ha sido notificado de conformidad con lo dispuesto en el art. 44 del Código de Procedimiento Civil',
    fuerzaPublica: 'Con el auxilio de la fuerza pública, se ha trabado embargo sobre bienes de su propiedad,',
    vehiculo: `Se ha trabado embargo para el vehículo placa patente ${data.detalle}`,
    propiedad: `Se ha trabado embargo sobre el siguiente bien raíz de su propiedad, inscrito en el C.B.R. ${data.detalle} del registro de propiedad`,
    cumplimiento: 'Ha sido notificado por cédula, del cumplimiento incidental ordenado en autos,',
    otro: data.detalle,
  }
  return `Hago saber a Ud. que con fecha ${cartaDateInWords(data.fecha)}.-\n${descriptions[data.formato]} en causa rol n° ${data.rol} caratulada ${data.caratula} del ${data.tribunal}.`
}

// Standard PDF fonts cover Spanish. Normalize pasted typography and replace unsupported glyphs.
function printable(text: string, font: PDFFont): string {
  return Array.from(text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ')).map(char => {
    if (char === '\n') return char
    try { font.encodeText(char); return char } catch { return '?' }
  }).join('')
}

export async function buildCartaCertificadaPdf(data: CartaVariables): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([612, 1008])
  let y = 892
  const width = 492
  // Wrap even long unbroken references and paginate before any text reaches the bottom margin.
  const lines = (text: string, size: number, face: PDFFont) => {
    const result: string[] = []
    for (const paragraph of printable(text, face).split('\n')) {
      let line = ''
      for (const word of paragraph.split(/\s+/)) {
        if (line && face.widthOfTextAtSize(`${line} ${word}`, size) > width) { result.push(line); line = '' }
        for (const char of (line ? ' ' : '') + word) {
          if (face.widthOfTextAtSize(line + char, size) > width) { result.push(line); line = '' }
          line += char
        }
      }
      result.push(line)
    }
    return result
  }
  const write = (text: string, size = 12, face = font, centered = false) => {
    for (const line of lines(text, size, face)) {
      if (y < 72) { page = doc.addPage([612, 1008]); y = 900 }
      page.drawText(line, { x: centered ? (612 - face.widthOfTextAtSize(line, size)) / 2 : 68, y, size, font: face })
      y -= size * 1.15
    }
  }
  write(data.receptorNombre, 14, bold)
  y -= 8
  write(data.receptorDireccion, 10, bold)
  y = Math.min(y - 65, 747)
  write('N O T I F I C A C I Ó N.-', 39, font, true)
  y -= 40
  write(`SEÑOR(a): ${data.nombre}`)
  write(`DIRECCIÓN: ${data.direccion}`)
  write(`COMUNA: ${data.comuna}`)
  y -= 28
  write(cartaParagraph(data))
  y -= 76
  if (y < 110) { page = doc.addPage([612, 1008]); y = 900 }
  write(data.receptorNombre.toLocaleUpperCase('es-CL'), 10, font, true)
  write('Receptor Judicial', 10, font, true)
  return Buffer.from(await doc.save()).toString('base64')
}
