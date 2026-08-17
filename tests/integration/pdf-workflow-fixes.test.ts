import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'

import { buildPdfDownloadFileName, contentDispositionForPdf } from '../../lib/documents/downloadFileName'
import { buildEstampoPdf } from '../../lib/estampos/pdf'
import { buildCustomEstampoVariables } from '../../lib/estampos/legacy'
import { replaceVariables } from '../../lib/estampos/text'
import { extractVariables } from '../../lib/estampos/variables'
import { formatReceiptDate } from '../../lib/utils/dateFormat'
import { dmyDateToIso, formatDmyDateInput, isoDateToDmy, localDateToDmy } from '../../lib/utils/dateInput'
import { ReciboGenerateSchema } from '../../lib/validations/rol-workspace'

const headerData = {
  receptorNombre: 'Receptor Judicial QA',
  tribunalNombre: '1 Juzgado Civil de Santiago',
  rolNumero: 'C-1452-2026',
  bancoNombre: 'Banco QA',
  ejecutadoNombre: 'Ejecutado QA',
}

function fakeDiligencia(meta: Record<string, unknown>, cuantia = 9_999_999) {
  return {
    id: 'diligencia-1',
    rolId: 'rol-1',
    tipoId: 'tipo-1',
    fecha: new Date('2026-08-04T12:00:00'),
    estado: 'pendiente',
    estadoCobro: 'NO_PAGADO',
    fechaPago: null,
    createdAt: new Date(),
    meta,
    rol: {
      rol: 'C-1452-2026',
      tribunal: { id: 1, nombre: 'Tribunal QA' },
      demanda: {
        cuantia,
        abogados: {
          nombre: 'Abogado QA',
          direccion: null,
          comuna: null,
          bancos: [{ banco: { nombre: 'Banco QA' } }],
        },
        ejecutados: [{
          id: 'ejecutado-1',
          demandaId: 'demanda-1',
          nombre: 'Ejecutado QA',
          direccion: 'Direccion QA',
          rut: '1-9',
          comunaId: null,
          rvm: null,
          comunas: null,
        }],
      },
    },
  } as any
}

describe('PDF workflow fixes', () => {
  it('formats receipt dates with a numeric day and year', () => {
    expect(formatReceiptDate(new Date(2026, 7, 4, 12))).toBe('4 de agosto de 2026')
  })

  it('accepts execution dates only as day, month, year in the wizard', () => {
    expect(formatDmyDateInput('04082026')).toBe('04/08/2026')
    expect(isoDateToDmy('2026-08-04')).toBe('04/08/2026')
    expect(dmyDateToIso('04/08/2026')).toBe('2026-08-04')
    expect(dmyDateToIso('08/04/2026')).toBe('2026-04-08')
    expect(dmyDateToIso('31/02/2026')).toBeNull()
    expect(localDateToDmy(new Date(2026, 7, 4, 12))).toBe('04/08/2026')
  })

  it('builds readable estampo and receipt download names', () => {
    const common = {
      rol: 'C-1452-2026',
      estampoName: 'Busqueda Negativa',
      executionDate: new Date(2026, 6, 23, 12),
      fallbackFileName: 'fallback.pdf',
    }
    expect(buildPdfDownloadFileName({ ...common, documentType: 'Estampo' }))
      .toBe('c-1452-2026. Busqueda Negativa. 23-07-26.pdf')
    expect(buildPdfDownloadFileName({ ...common, documentType: 'Recibo' }))
      .toBe('RECIBO. c-1452-2026. Busqueda Negativa. 23-07-26.pdf')
  })

  it('sanitizes unsafe filename characters, preserves UTF-8, and falls back safely', () => {
    const fileName = buildPdfDownloadFileName({
      documentType: 'Estampo',
      rol: 'C/1452:2026',
      estampoName: 'Búsqueda <Negativa>',
      executionDate: new Date(2026, 6, 23, 12),
      fallbackFileName: 'fallback.pdf',
    })
    expect(fileName).toBe('c-1452-2026. Búsqueda -Negativa-. 23-07-26.pdf')
    expect(contentDispositionForPdf(null, fileName)).toContain("filename*=UTF-8''")
    expect(buildPdfDownloadFileName({
      documentType: 'Recibo',
      rol: null,
      estampoName: null,
      executionDate: null,
      fallbackFileName: 'recibo-qa',
    })).toBe('recibo-qa.pdf')
  })

  it('treats Pagina as an explicit page break and repeats sizing for new pages', async () => {
    expect(extractVariables('$rol$Pagina$monto_ejecutado')).toEqual(['rol', 'monto_ejecutado'])
    expect(replaceVariables('Uno$Pagina$rol', { rol: 'C-1452-2026' }))
      .toBe('Uno$PaginaC-1452-2026')

    const explicit = await PDFDocument.load(Buffer.from(
      await buildEstampoPdf('Primera pagina$PaginaSegunda pagina', headerData),
      'base64'
    ))
    expect(explicit.getPageCount()).toBe(2)
    expect(explicit.getPages().map(page => page.getSize())).toEqual([
      { width: 595, height: 842 },
      { width: 595, height: 842 },
    ])

    const consecutive = await PDFDocument.load(Buffer.from(
      await buildEstampoPdf('Uno$Pagina$PaginaTres', headerData),
      'base64'
    ))
    expect(consecutive.getPageCount()).toBe(3)

    const overflow = await PDFDocument.load(Buffer.from(
      await buildEstampoPdf(Array.from({ length: 150 }, (_, index) => `Linea ${index}`).join('\n'), headerData),
      'base64'
    ))
    expect(overflow.getPageCount()).toBeGreaterThan(1)
  })

  it('resolves monto_ejecutado from receipt charge, then notification amount, never cuantia', () => {
    const fromReceipt = buildCustomEstampoVariables(
      fakeDiligencia({ monto: 15_000 }),
      { officeName: 'QA' },
      { receptorNombre: 'QA' },
      undefined,
      25_000
    )
    expect(fromReceipt.monto_ejecutado).toBe('$25.000')

    const fromMeta = buildCustomEstampoVariables(
      fakeDiligencia({ monto: 15_000 }),
      { officeName: 'QA' },
      { receptorNombre: 'QA' }
    )
    expect(fromMeta.monto_ejecutado).toBe('$15.000')

    const withoutCharge = buildCustomEstampoVariables(
      fakeDiligencia({}),
      { officeName: 'QA' },
      { receptorNombre: 'QA' }
    )
    expect(withoutCharge.monto_ejecutado).toBe('')
    expect(withoutCharge.cuantia).toBe('9.999.999')
  })

  it('defaults manual arancel persistence to opt-in false', () => {
    const parsed = ReciboGenerateSchema.parse({
      notificacionId: 'notification-1',
      bancoId: 1,
      operation: 'GENERATE',
      ejecucion: { fecha: '2026-08-04', hora: '14:00' },
      estampoTipo: { kind: 'CUSTOM', estampoId: 'stamp-1' },
      monto: 25_000,
      medio: 'No especificado',
    })
    expect(parsed.saveManualArancelAsDefault).toBe(false)
    expect(ReciboGenerateSchema.parse({
      notificacionId: 'notification-2',
      bancoId: 1,
      operation: 'GENERATE',
      ejecucion: { fecha: '2026-08-04', hora: '' },
      estampoTipo: { kind: 'CUSTOM', estampoId: 'stamp-1' },
      monto: 25_000,
      medio: 'No especificado',
    }).ejecucion.hora).toBe('')
  })
})
