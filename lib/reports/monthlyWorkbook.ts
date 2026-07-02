import ExcelJS from 'exceljs'
import type { ActivityEvent, User } from '@prisma/client'

import { dailyEventDetail } from './dailyWorkbook'
import { formatChileDateTime } from './chileTime'
import { MONTHLY_FINANCIAL_LABELS, summarizeMonthlyAmounts, type MonthlyFinancialClass } from './monthlyCore'

type EventWithUser = ActivityEvent & { user: Pick<User, 'email'> }

export type MonthlyReportRow = {
  receiptId: string
  notificationId: string
  rolId: string
  rol: string
  tribunal: string
  caratula: string
  gestion: string
  resultado: string
  estampoTemplate: string
  abogado: string
  procurador: string
  banco: string
  numeroRecibo: string
  numeroBoleta: string
  fechaEjecucion: Date
  fechaPago: Date | null
  estadoCobro: string
  amount: number
  financialClass: MonthlyFinancialClass
  reconciliationWarnings: string[]
}

export type MonthlyExclusionDetail = {
  receiptId: string
  notificationId: string
  rol: string
  numeroRecibo: string
  amount: number
  reason: string
}

export type MonthlyWorkbookInput = {
  officeName: string
  periodDate: string
  periodStart: Date
  periodEnd: Date
  generatedAt: Date
  rows: MonthlyReportRow[]
  exclusions: MonthlyExclusionDetail[]
  activityEvents: EventWithUser[]
  deletionEvents: EventWithUser[]
  errorEvents: EventWithUser[]
}

const MONEY_FORMAT = '$#,##0'

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
}

function configureSheet(sheet: ExcelJS.Worksheet, widths: number[], headerRowNumber = 1) {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }]
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: widths.length },
  }
  sheet.eachRow((row, index) => {
    if (index >= headerRowNumber) row.alignment = { vertical: 'top', wrapText: true }
  })
}

function rowValues(row: MonthlyReportRow) {
  return [
    row.rol,
    row.tribunal,
    row.caratula,
    row.gestion,
    row.resultado,
    row.estampoTemplate,
    row.abogado,
    row.procurador,
    row.banco,
    row.numeroRecibo,
    row.numeroBoleta,
    row.fechaEjecucion,
    row.fechaPago,
    row.estadoCobro === 'PAGADO' ? 'Pagado' : 'Sin pagar',
    MONTHLY_FINANCIAL_LABELS[row.financialClass],
    row.amount,
    row.reconciliationWarnings.join(', '),
    row.notificationId,
    row.receiptId,
  ]
}

function addRowsSheet(workbook: ExcelJS.Workbook, name: string, rows: MonthlyReportRow[]) {
  const sheet = workbook.addWorksheet(name)
  const headers = [
    'ROL',
    'Tribunal',
    'Caratula',
    'Gestion',
    'Resultado',
    'Plantilla',
    'Abogado',
    'Procurador',
    'Banco',
    'Recibo',
    'Boleta',
    'Fecha ejecucion',
    'Fecha pago',
    'Estado pago',
    'Clasificacion',
    'Monto',
    'Revision',
    'Notificacion ID',
    'Recibo ID',
  ]
  styleHeader(sheet.addRow(headers))
  for (const row of rows) sheet.addRow(rowValues(row))
  if (!rows.length) sheet.addRow(['Sin registros'])
  sheet.getColumn(12).numFmt = 'dd-mm-yyyy'
  sheet.getColumn(13).numFmt = 'dd-mm-yyyy'
  sheet.getColumn(16).numFmt = MONEY_FORMAT
  configureSheet(sheet, [16, 22, 36, 24, 18, 26, 28, 28, 28, 18, 18, 18, 18, 16, 26, 16, 30, 32, 32])
}

function addGroupedSheet(workbook: ExcelJS.Workbook, name: string, rows: MonthlyReportRow[], groupValue: (row: MonthlyReportRow) => string) {
  const sheet = workbook.addWorksheet(name)
  styleHeader(sheet.addRow(['Grupo', 'Notificaciones', 'Por cobrar', 'Boletado pendiente', 'Pagado', 'Total']))
  const groups = new Map<string, MonthlyReportRow[]>()
  for (const row of rows) {
    const key = groupValue(row) || '-'
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  for (const [key, groupRows] of Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
    const porCobrar = groupRows.filter(row => row.financialClass === 'por_cobrar').reduce((sum, row) => sum + row.amount, 0)
    const boletado = groupRows.filter(row => row.financialClass === 'boletado_pendiente').reduce((sum, row) => sum + row.amount, 0)
    const pagado = groupRows.filter(row => row.financialClass === 'pagado').reduce((sum, row) => sum + row.amount, 0)
    sheet.addRow([key, groupRows.length, porCobrar, boletado, pagado, { formula: `SUM(C${sheet.rowCount + 1}:E${sheet.rowCount + 1})` }])
  }
  if (!groups.size) sheet.addRow(['Sin registros', 0, 0, 0, 0, 0])
  for (let column = 3; column <= 6; column += 1) sheet.getColumn(column).numFmt = MONEY_FORMAT
  configureSheet(sheet, [34, 16, 18, 22, 18, 18])
}

function addEventsSheet(workbook: ExcelJS.Workbook, name: string, events: EventWithUser[]) {
  const sheet = workbook.addWorksheet(name)
  styleHeader(sheet.addRow(['Fecha y hora', 'Usuario', 'Modulo', 'Evento', 'Resultado', 'ROL', 'Descripcion', 'Detalle']))
  for (const event of events) {
    sheet.addRow([
      event.occurredAt,
      event.user.email,
      event.module,
      event.eventType,
      event.result,
      event.rol ?? '',
      event.description,
      dailyEventDetail(event),
    ])
  }
  if (!events.length) sheet.addRow(['Sin actividad'])
  sheet.getColumn(1).numFmt = 'dd-mm-yyyy hh:mm:ss'
  configureSheet(sheet, [22, 34, 20, 30, 14, 18, 48, 68])
}

function addExclusionsSheet(workbook: ExcelJS.Workbook, exclusions: MonthlyExclusionDetail[], rows: MonthlyReportRow[]) {
  const sheet = workbook.addWorksheet('Excluidos y revision')
  styleHeader(sheet.addRow(['Tipo', 'ROL', 'Recibo', 'Notificacion ID', 'Recibo ID', 'Monto', 'Motivo']))
  for (const exclusion of exclusions) {
    sheet.addRow(['Excluido', exclusion.rol, exclusion.numeroRecibo, exclusion.notificationId, exclusion.receiptId, exclusion.amount, exclusion.reason])
  }
  for (const row of rows.filter(item => item.reconciliationWarnings.length)) {
    sheet.addRow(['Revision', row.rol, row.numeroRecibo, row.notificationId, row.receiptId, row.amount, row.reconciliationWarnings.join(', ')])
  }
  if (!exclusions.length && !rows.some(item => item.reconciliationWarnings.length)) sheet.addRow(['Sin observaciones'])
  sheet.getColumn(6).numFmt = MONEY_FORMAT
  configureSheet(sheet, [16, 18, 18, 32, 32, 16, 48])
}

function addSummary(workbook: ExcelJS.Workbook, input: MonthlyWorkbookInput) {
  const sheet = workbook.addWorksheet('Resumen ejecutivo')
  sheet.addRow(['Reporte mensual de facturacion'])
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0F172A' } }
  sheet.addRow(['Oficina', input.officeName])
  sheet.addRow(['Periodo', input.periodDate])
  sheet.addRow(['Inicio Chile', formatChileDateTime(input.periodStart)])
  sheet.addRow(['Fin Chile', formatChileDateTime(input.periodEnd)])
  sheet.addRow(['Generado', formatChileDateTime(input.generatedAt)])
  sheet.addRow(['Notificaciones calificadas', input.rows.length])
  sheet.addRow(['Excluidos', input.exclusions.length])
  sheet.addRow([])
  styleHeader(sheet.addRow(['Clasificacion', 'Cantidad', 'Monto']))
  const summary = summarizeMonthlyAmounts(input.rows)
  for (const [classification, values] of Array.from(summary.entries())) {
    sheet.addRow([MONTHLY_FINANCIAL_LABELS[classification], values.count, values.amount])
  }
  const totalRow = sheet.addRow(['Total', { formula: `SUM(B11:B13)` }, { formula: `SUM(C11:C13)` }])
  totalRow.font = { bold: true }
  sheet.getColumn(3).numFmt = MONEY_FORMAT
  configureSheet(sheet, [34, 18, 18], 10)
}

export async function buildMonthlyBillingWorkbook(input: MonthlyWorkbookInput) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'NOTIFICA IA'
  workbook.created = input.generatedAt
  workbook.modified = input.generatedAt

  addSummary(workbook, input)
  addRowsSheet(workbook, 'Por cobrar', input.rows.filter(row => row.financialClass === 'por_cobrar'))
  addRowsSheet(workbook, 'Boletado pendiente', input.rows.filter(row => row.financialClass === 'boletado_pendiente'))
  addRowsSheet(workbook, 'Pagado', input.rows.filter(row => row.financialClass === 'pagado'))
  addGroupedSheet(workbook, 'Por abogado', input.rows, row => row.abogado)
  addGroupedSheet(workbook, 'Por procurador', input.rows, row => row.procurador)
  addGroupedSheet(workbook, 'Por banco', input.rows, row => row.banco)
  addGroupedSheet(workbook, 'Por tipo de gestion', input.rows, row => row.gestion)
  addEventsSheet(workbook, 'Por usuario', input.activityEvents)
  addRowsSheet(workbook, 'Notificaciones completadas', input.rows)
  addEventsSheet(workbook, 'Actividad general', input.activityEvents)
  addEventsSheet(workbook, 'Eliminaciones y anulaciones', input.deletionEvents)
  addEventsSheet(workbook, 'Errores', input.errorEvents)
  addExclusionsSheet(workbook, input.exclusions, input.rows)
  addRowsSheet(workbook, 'Detalle completo', input.rows)

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
