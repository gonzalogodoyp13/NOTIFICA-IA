import ExcelJS from 'exceljs'

import type { ReceiptListRow } from '@/lib/recibos/query'

function asDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function buildRecibosWorkbook(rows: ReceiptListRow[], filterSummary: string) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'NOTIFICA IA'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Recibos', { views: [{ state: 'frozen', ySplit: 4 }] })

  sheet.mergeCells('A1:N1')
  sheet.getCell('A1').value = 'Gestión de Recibos'
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F172A' } }
  sheet.mergeCells('A2:N2')
  sheet.getCell('A2').value = `Exportado: ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`
  sheet.mergeCells('A3:N3')
  sheet.getCell('A3').value = `Filtros: ${filterSummary || 'Sin resumen'}`

  const headers = ['ROL', 'Tribunal', 'Carátula', 'Gestión', 'Estampo', 'Monto', 'N° Boleta', 'Fecha ejecución', 'Estado', 'N° Recibo', 'Abogado', 'Procurador', 'Banco', 'Fecha recibo']
  const headerRow = sheet.addRow(headers)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

  for (const row of rows) {
    sheet.addRow([
      row.rol, row.tribunal, row.caratula, row.gestion, row.estampoTemplate,
      row.valor, row.numeroBoleta, asDate(row.fechaEjecucion), row.estado, row.numeroRecibo,
      row.abogado, row.procurador, row.banco, asDate(row.fechaRecibo),
    ])
  }

  const totalRow = sheet.addRow(['TOTAL', '', '', '', '', rows.length ? { formula: `SUM(F5:F${sheet.rowCount})`, result: rows.reduce((sum, row) => sum + row.valor, 0) } : 0])
  totalRow.font = { bold: true }
  sheet.getColumn(6).numFmt = '$#,##0;[Red]-$#,##0'
  for (const column of [8, 14]) sheet.getColumn(column).numFmt = 'dd-mm-yyyy'
  const widths = [14, 21, 30, 19, 23, 14, 16, 16, 12, 18, 21, 21, 21, 16]
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  sheet.autoFilter = { from: 'A4', to: 'N4' }
  sheet.eachRow((row, index) => {
    if (index > 1) row.font = { ...row.font, size: 10 }
    if (index >= 4) row.alignment = { vertical: 'top', wrapText: true }
  })

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
