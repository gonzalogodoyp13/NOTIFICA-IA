import ExcelJS from 'exceljs'
import type { ReconciliationRow } from '@/lib/recibos/reconciliation'

function date(value: string | null) { return value ? new Date(value) : null }

export async function buildReconciliationWorkbook(params: { rows: ReconciliationRow[]; kpis: Record<string, number>; groupBy: string; filterSummary: string }) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'NOTIFICA IA'; workbook.created = new Date()
  const sheet = workbook.addWorksheet('Conciliacion', { views: [{ state: 'frozen', ySplit: 8 }] })
  sheet.mergeCells('A1:P1'); sheet.getCell('A1').value = 'Conciliacion de Recibos'; sheet.getCell('A1').font = { bold: true, size: 16 }
  sheet.mergeCells('A2:P2'); sheet.getCell('A2').value = `Agrupacion: ${params.groupBy} | Filtros: ${params.filterSummary || 'Aplicados'}`
  sheet.addRow(['Total', params.kpis.total, 'Conciliados', params.kpis.reconciled, '% conciliacion', params.kpis.reconciliationPercentage, 'Sin boleta', params.kpis.missingBoleta])
  sheet.addRow(['Pendientes pago', params.kpis.pendingPayment, 'Pagados sin boleta', params.kpis.paidWithoutBoleta, 'Monto total', params.kpis.totalAmount])
  sheet.addRow([]); sheet.addRow([]); sheet.addRow([])
  const headers = ['Categoria', 'N° Recibo', 'ROL', 'Tribunal', 'Caratula', 'Gestion', 'Estampo', 'Procurador', 'Banco', 'Monto', 'Estado', 'N° Boleta', 'Fecha ejecucion', 'Fecha recibo', 'Fecha pago', 'Resultado']
  const header = sheet.addRow(headers); header.font = { bold: true, color: { argb: 'FFFFFFFF' } }; header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  for (const row of params.rows) sheet.addRow([row.categoryLabel, row.numeroRecibo, row.rol, row.tribunal, row.caratula, row.gestion, row.estampoTemplate, row.procurador, row.banco, row.valor, row.estado, row.numeroBoleta, date(row.fechaEjecucion), date(row.fechaRecibo), date(row.fechaPago), row.resultado])
  sheet.getColumn(10).numFmt = '$#,##0;[Red]-$#,##0'; [13, 14, 15].forEach(index => { sheet.getColumn(index).numFmt = 'dd-mm-yyyy' })
  ;[24,18,16,24,32,22,24,22,24,16,14,18,18,18,18,22].forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  sheet.autoFilter = { from: 'A8', to: 'P8' }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
