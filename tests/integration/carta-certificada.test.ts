import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildCartaCertificadaPdf, cartaDateInWords, cartaParagraph, type CartaVariables } from '@/lib/pdf/carta-certificada'
import { CARTA_FORMATOS, CartaCertificadaSchema, type CartaFormato } from '@/lib/validations/carta-certificada'

const sample: CartaVariables = {
  receptorNombre: 'Gonzalo Godoy Moersch', receptorDireccion: 'Irarrázabal 0276 - Puente Alto',
  nombre: 'LUIS OLEGARIO ALLENDES HERRERA', direccion: 'MARCOS PÉREZ 202', comuna: 'Puente Alto',
  fecha: '2025-11-16', formato: 'art44', detalle: '', rol: 'C-7371-2025',
  caratula: 'BANCO DEL ESTADO DE CHILE / ALLENDES', tribunal: '1° Juzgado Civil de Puente Alto',
}

describe('carta certificada', () => {
  it.each([
    ['2025-11-16', 'dieciséis de noviembre de dos mil veinticinco'],
    ['2024-02-29', 'veintinueve de febrero de dos mil veinticuatro'],
    ['2031-01-31', 'treinta y uno de enero de dos mil treinta y uno'],
    ['1999-12-01', 'uno de diciembre de mil novecientos noventa y nueve'],
  ])('writes %s entirely in Spanish words', (date, expected) => expect(cartaDateInWords(date)).toBe(expected))

  it('rejects impossible dates and missing conditional fields', () => {
    const input = { ejecutadoId: 'a', direccionEjecutadoId: 'b', fecha: '2025-02-29', formato: 'art44' }
    expect(CartaCertificadaSchema.safeParse(input).success).toBe(false)
    for (const formato of ['vehiculo', 'propiedad', 'otro']) {
      expect(CartaCertificadaSchema.safeParse({ ...input, fecha: '2024-02-29', formato, detalle: ' ' }).success).toBe(false)
      expect(CartaCertificadaSchema.safeParse({ ...input, fecha: '2024-02-29', formato, detalle: 'ABCD12' }).success).toBe(true)
    }
  })

  it.each(Object.keys(CARTA_FORMATOS) as CartaFormato[])('generates an oficio PDF for %s with the shared case data', async formato => {
    const data = { ...sample, formato, detalle: 'ABCD12' }
    const paragraph = cartaParagraph(data)
    expect(paragraph).toContain('dieciséis de noviembre de dos mil veinticinco')
    expect(paragraph).toContain(`en causa rol n° ${sample.rol} caratulada ${sample.caratula} del ${sample.tribunal}.`)
    if (['vehiculo', 'propiedad', 'otro'].includes(formato)) expect(paragraph).toContain('ABCD12')
    const bytes = Buffer.from(await buildCartaCertificadaPdf(data), 'base64')
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 1008 })
    if (process.env.CARTA_PDF_QA_DIR) {
      const fs = await import('node:fs/promises')
      await fs.mkdir(process.env.CARTA_PDF_QA_DIR, { recursive: true })
      await fs.writeFile(`${process.env.CARTA_PDF_QA_DIR}/${formato}.pdf`, bytes)
    }
  })

  it('paginates long free text and supports pasted unsupported glyphs without crashing', async () => {
    const bytes = Buffer.from(await buildCartaCertificadaPdf({ ...sample, formato: 'otro', detalle: 'Texto extenso 🙂 '.repeat(800) }), 'base64')
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
  })
})
