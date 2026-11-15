import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { buildRecibosWorkbook } from '../../lib/recibos/xlsx'
import { validateRecibosWorkbook } from '../../scripts/qa-support'

describe('receipt export workbook validation', () => {
  it('parses generated XLSX bytes and finds the QA receipt row', async () => {
    const workbook = await buildRecibosWorkbook([
      {
        reciboId: 'qa-recibo',
        createdAt: '2026-06-10T14:20:00.000Z',
        rolId: 'qa-role',
        documentoId: 'qa-doc',
        notificacionId: 'qa-notification',
        numeroRecibo: 'QA-REC-001',
        rol: 'QA-P9-EXPORT',
        tribunal: 'QA Tribunal',
        caratula: 'QA Caratula',
        gestion: 'Notificacion',
        estampoTemplate: 'QA Template',
        estampoTemplateKey: 'custom:qa',
        resultado: 'POSITIVA',
        abogadoId: 1,
        abogado: 'QA Abogado',
        abogadoEmail: 'abogado@example.com',
        procuradorId: 2,
        procurador: 'QA Procurador',
        procuradorEmail: 'procurador@example.com',
        banco: 'QA Banco',
        valor: 25000,
        fechaRecibo: '2026-06-10T14:20:00.000Z',
        fechaEjecucion: '2026-06-10T14:00:00.000Z',
        fechaPago: '2026-06-11T14:00:00.000Z',
        estado: 'Pagado',
        numeroBoleta: 'B-QA-001',
      },
    ], 'QA export')

    const parsed = new ExcelJS.Workbook()
    await parsed.xlsx.load(workbook as unknown as Parameters<typeof parsed.xlsx.load>[0])
    const sheet = parsed.getWorksheet('Recibos')!
    expect((sheet.getRow(4).values as unknown[]).slice(1)).toEqual([
      'ROL', 'Tribunal', 'Carátula', 'Gestión', 'Estampo', 'Monto', 'N° Boleta',
      'Fecha ejecución', 'Estado', 'N° Recibo', 'Abogado', 'Procurador', 'Banco', 'Fecha recibo',
    ])
    expect((sheet.getRow(5).values as unknown[]).slice(1)).toEqual([
      'QA-P9-EXPORT', 'QA Tribunal', 'QA Caratula', 'Notificacion', 'QA Template', 25000,
      'B-QA-001', new Date('2026-06-10T14:00:00.000Z'), 'Pagado', 'QA-REC-001',
      'QA Abogado', 'QA Procurador', 'QA Banco', new Date('2026-06-10T14:20:00.000Z'),
    ])
    expect(sheet.getCell('F6').value).toEqual({ formula: 'SUM(F5:F5)', result: 25000 })
    expect(sheet.getCell('F5').numFmt).toBe('$#,##0;[Red]-$#,##0')
    expect(sheet.getCell('H5').numFmt).toBe('dd-mm-yyyy')
    expect(sheet.getCell('N5').numFmt).toBe('dd-mm-yyyy')
    expect(sheet.autoFilter).toBe('A4:N4')

    await expect(validateRecibosWorkbook(Buffer.from(workbook), 'QA-P9-EXPORT')).resolves.toBeUndefined()
  })
  it('exports an empty list with a zero total instead of a circular formula', async () => {
    const bytes = await buildRecibosWorkbook([], '')
    const parsed = new ExcelJS.Workbook()
    await parsed.xlsx.load(bytes as unknown as Parameters<typeof parsed.xlsx.load>[0])
    expect(parsed.getWorksheet('Recibos')!.getCell('F5').value).toBe(0)
  })
})

