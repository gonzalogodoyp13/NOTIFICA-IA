import { expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib'
import { buildEstampoPdf } from '../../lib/estampos/pdf'

const sello = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const header = { receptorNombre: 'Test', rolNumero: 'C-1-2026', tribunalNombre: null, bancoNombre: null, ejecutadoNombre: null }
async function images(text: string, addStamp: boolean) {
  const pdf = await PDFDocument.load(Buffer.from(await buildEstampoPdf(text, header, { sello }, { addStamp }), 'base64'))
  return pdf.getPages().reduce((count, page) => count + (page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys().length ?? 0), 0)
}
it('adds the configured timbre only when selected, without duplicating a template stamp', async () => {
  expect(await images('Estampo de prueba', false)).toBe(0)
  expect(await images('Estampo de prueba', true)).toBe(1)
  expect(await images('Estampo de prueba\n$sello', true)).toBe(1)
})
