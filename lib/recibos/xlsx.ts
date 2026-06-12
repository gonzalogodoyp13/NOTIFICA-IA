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

  sheet.mergeCells('A1:P1')
  sheet.getCell('A1').value = 'Gestion de Recibos'
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0F172A' } }
  sheet.mergeCells('A2:P2')
  sheet.getCell('A2').value = `Exportado: ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`
  sheet.mergeCells('A3:P3')
  sheet.getCell('A3').value = `Filtros: ${filterSummary || 'Sin resumen'}`

  const headers = ['N° Recibo', 'ROL', 'Tribunal', 'Caratula', 'Gestion', 'Estampo', 'Resultado', 'Abogado', 'Procurador', 'Banco', 'Monto', 'Estado', 'N° Boleta', 'Fecha ejecucion', 'Fecha recibo', 'Fecha pago']
  const headerRow = sheet.addRow(headers)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

  for (const row of rows) {
    sheet.addRow([
      row.numeroRecibo, row.rol, row.tribunal, row.caratula, row.gestion, row.estampoTemplate,
      row.resultado, row.abogado, row.procurador, row.banco, row.valor, row.estado, row.numeroBoleta,
      asDate(row.fechaEjecucion), asDate(row.fechaRecibo), asDate(row.fechaPago),
    ])
  }

  const totalRow = sheet.addRow(['TOTAL', '', '', '', '', '', '', '', '', '', { formula: `SUM(K5:K${Math.max(5, sheet.rowCount)})` }])
  totalRow.font = { bold: true }
  sheet.getColumn(11).numFmt = '$#,##0;[Red]-$#,##0'
  for (const column of [14, 15, 16]) sheet.getColumn(column).numFmt = 'dd-mm-yyyy'
  const widths = [18, 16, 24, 34, 22, 26, 22, 24, 24, 24, 16, 14, 18, 18, 18, 18]
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  sheet.autoFilter = { from: 'A4', to: 'P4' }
  sheet.eachRow((row, index) => {
    if (index >= 4) row.alignment = { vertical: 'top', wrapText: true }
  })

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
