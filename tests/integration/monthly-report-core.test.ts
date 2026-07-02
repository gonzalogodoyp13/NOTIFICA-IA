import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { chileMonthBounds, previousChileMonthString } from '../../lib/reports/chileTime'
import { buildMonthlyBillingWorkbook } from '../../lib/reports/monthlyWorkbook'
import {
  buildMonthlyReportEmail,
  classifyMonthlyFinancialState,
  monthlyFinancialSummary,
  qualifyMonthlySources,
  summarizeMonthlyAmounts,
} from '../../lib/reports/monthlyCore'

function validNotification(id = 'n1') {
  return {
    id,
    documents: [
      { id: 'recibo-doc', tipo: 'Recibo', pdfId: 'pdf-recibo', createdAt: new Date('2026-06-10T12:00:00Z') },
      { id: 'estampo-doc', tipo: 'Estampo', pdfId: 'pdf-estampo', createdAt: new Date('2026-06-10T13:00:00Z') },
    ],
  }
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    reciboId: String(overrides.reciboId ?? 'r1'),
    notificacionId: overrides.notificacionId === undefined ? 'n1' : overrides.notificacionId as string | null,
    documentoId: overrides.documentoId === undefined ? 'recibo-doc' : overrides.documentoId as string | null,
    createdAt: overrides.createdAt as Date ?? new Date('2026-06-10T14:00:00Z'),
    fechaEjecucion: overrides.fechaEjecucion === undefined ? new Date('2026-06-10T14:00:00Z') : overrides.fechaEjecucion as Date | null,
    monto: overrides.monto === undefined ? 25000 : Number(overrides.monto),
    documentVersionDeletedAt: overrides.documentVersionDeletedAt as Date | null | undefined,
  }
}

describe('monthly report core', () => {
  it('computes Chile month bounds with timezone offsets', () => {
    const june = chileMonthBounds('2026-06')
    expect(june.isoMonth).toBe('2026-06')
    expect(june.start.toISOString()).toBe('2026-06-01T04:00:00.000Z')
    expect(june.endExclusive.toISOString()).toBe('2026-07-01T04:00:00.000Z')

    const september = chileMonthBounds('2026-09')
    expect(september.start.toISOString()).toBe('2026-09-01T04:00:00.000Z')
    expect(september.endExclusive.toISOString()).toBe('2026-10-01T03:00:00.000Z')
  })

  it('defaults to the previous Chile-local month', () => {
    expect(previousChileMonthString(new Date('2026-06-15T12:00:00Z'))).toBe('2026-05')
    expect(previousChileMonthString(new Date('2026-01-05T12:00:00Z'))).toBe('2025-12')
    expect(previousChileMonthString(new Date('2026-10-01T02:30:00Z'))).toBe('2026-08')
    expect(previousChileMonthString(new Date('2026-10-01T03:30:00Z'))).toBe('2026-09')
  })

  it('classifies monthly financial states and flags paid without boleta', () => {
    expect(classifyMonthlyFinancialState({ estadoCobro: 'NO_PAGADO', numeroBoleta: null }).financialClass).toBe('por_cobrar')
    expect(classifyMonthlyFinancialState({ estadoCobro: 'NO_PAGADO', numeroBoleta: 'B-1' }).financialClass).toBe('boletado_pendiente')
    const paid = classifyMonthlyFinancialState({ estadoCobro: 'PAGADO', numeroBoleta: null })
    expect(paid.financialClass).toBe('pagado')
    expect(paid.reconciliationWarnings).toContain('pagado_sin_boleta')
  })

  it('qualifies only completed valid workflows and keeps latest valid receipt per notification', () => {
    const result = qualifyMonthlySources([
      { receipt: receipt({ reciboId: 'old', createdAt: new Date('2026-06-10T12:00:00Z') }), notification: validNotification(), estadoCobro: 'NO_PAGADO', numeroBoleta: null },
      { receipt: receipt({ reciboId: 'new', createdAt: new Date('2026-06-10T15:00:00Z'), monto: 30000 }), notification: validNotification(), estadoCobro: 'PAGADO', numeroBoleta: null },
      { receipt: receipt({ reciboId: 'missing-date', fechaEjecucion: null }), notification: validNotification(), estadoCobro: 'NO_PAGADO', numeroBoleta: null },
      { receipt: receipt({ reciboId: 'no-link', notificacionId: null }), notification: null, estadoCobro: 'NO_PAGADO', numeroBoleta: null },
      { receipt: receipt({ reciboId: 'deleted-version', documentVersionDeletedAt: new Date() }), notification: validNotification(), estadoCobro: 'NO_PAGADO', numeroBoleta: null },
      { receipt: receipt({ reciboId: 'incomplete', notificacionId: 'n2' }), notification: { id: 'n2', documents: [{ id: 'recibo-doc', tipo: 'Recibo', pdfId: 'pdf' }] }, estadoCobro: 'NO_PAGADO', numeroBoleta: null },
    ])

    expect(result.qualified.map(row => row.receiptId)).toEqual(['new'])
    expect(result.qualified[0].financialClass).toBe('pagado')
    expect(result.qualified[0].reconciliationWarnings).toContain('pagado_sin_boleta')
    expect(result.exclusions.map(row => row.receiptId)).toEqual(expect.arrayContaining(['old', 'missing-date', 'no-link', 'deleted-version', 'incomplete']))
  })

  it('reconciles class totals', () => {
    const summary = summarizeMonthlyAmounts([
      { financialClass: 'por_cobrar', amount: 1000 },
      { financialClass: 'boletado_pendiente', amount: 2000 },
      { financialClass: 'pagado', amount: 3000 },
    ])
    expect(summary.get('por_cobrar')).toEqual({ count: 1, amount: 1000 })
    expect(summary.get('boletado_pendiente')).toEqual({ count: 1, amount: 2000 })
    expect(summary.get('pagado')).toEqual({ count: 1, amount: 3000 })
  })

  it('builds Spanish monthly email content without workbook data', () => {
    const summary = monthlyFinancialSummary([
      { financialClass: 'por_cobrar', amount: 1000 },
      { financialClass: 'boletado_pendiente', amount: 2000 },
      { financialClass: 'pagado', amount: 3000 },
    ])
    const email = buildMonthlyReportEmail({
      officeName: 'Oficina Centro',
      periodDate: '2026-05',
      qualifiedCount: 3,
      financialSummary: summary,
      downloadPath: '/ajustes/reportes?reportId=abc',
    })

    expect(email.subject).toBe('Reporte mensual NOTIFICA IA - Oficina Centro - 2026-05')
    expect(email.text).toContain('Periodo reportado: 2026-05')
    expect(email.text).toContain('Notificaciones calificadas: 3')
    expect(email.text).toContain('Total del periodo: $6.000')
    expect(email.text).toContain('/ajustes/reportes?reportId=abc')
    expect(email.text).not.toContain('C-1-2026')
  })

  it('builds the required monthly workbook sheets', async () => {
    const buffer = await buildMonthlyBillingWorkbook({
      officeName: 'Oficina QA',
      periodDate: '2026-06',
      periodStart: new Date('2026-06-01T04:00:00Z'),
      periodEnd: new Date('2026-07-01T03:59:59.999Z'),
      generatedAt: new Date('2026-06-24T12:00:00Z'),
      rows: [{
        receiptId: 'r1',
        notificationId: 'n1',
        rolId: 'role1',
        rol: 'C-1-2026',
        tribunal: 'Tribunal QA',
        caratula: 'QA',
        gestion: 'Notificacion',
        resultado: 'POSITIVA',
        estampoTemplate: 'Estampo QA',
        abogado: 'Abogada QA',
        procurador: 'Procurador QA',
        banco: 'Banco QA',
        numeroRecibo: 'REC-1',
        numeroBoleta: '',
        fechaEjecucion: new Date('2026-06-10T14:00:00Z'),
        fechaPago: null,
        estadoCobro: 'PAGADO',
        amount: 25000,
        financialClass: 'pagado',
        reconciliationWarnings: ['pagado_sin_boleta'],
      }],
      exclusions: [],
      activityEvents: [],
      deletionEvents: [],
      errorEvents: [],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([
      'Resumen ejecutivo',
      'Por cobrar',
      'Boletado pendiente',
      'Pagado',
      'Por abogado',
      'Por procurador',
      'Por banco',
      'Por tipo de gestion',
      'Por usuario',
      'Notificaciones completadas',
      'Actividad general',
      'Eliminaciones y anulaciones',
      'Errores',
      'Excluidos y revision',
      'Detalle completo',
    ])
    expect(workbook.getWorksheet('Resumen ejecutivo')?.getCell('C14').value).toEqual({ formula: 'SUM(C11:C13)' })
    expect(workbook.getWorksheet('Pagado')?.getColumn(16).numFmt).toBe('$#,##0')
  })
})
