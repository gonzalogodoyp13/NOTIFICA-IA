import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { classifyBulkItem, receiptBulkStateHash } from '../lib/recibos/bulk-core'
import { canonicalizeReceiptRows, classifyReconciliation, reconciliationGroupIdentity } from '../lib/recibos/reconciliation-core'
import { buildReconciliationWorkbook } from '../lib/recibos/reconciliation-xlsx'
import { buildRecibosWorkbook } from '../lib/recibos/xlsx'

const base = { reciboId: 'r1', notificacionId: 'n1', documentoId: 'd1', estado: 'Pagado' as const, numeroBoleta: 'B-1', banco: 'Banco', procurador: 'Proc', fechaEjecucion: '2026-06-01T12:00:00.000Z', valor: 1000 }
assert.equal(classifyReconciliation(base), 'RECONCILED')
assert.equal(classifyReconciliation({ ...base, estado: 'Sin pagar' }), 'BOLETA_PENDING_PAYMENT')
assert.equal(classifyReconciliation({ ...base, numeroBoleta: '-' }), 'PAID_WITHOUT_BOLETA')
assert.equal(classifyReconciliation({ ...base, estado: 'Sin pagar', numeroBoleta: '-' }), 'WITHOUT_BOLETA_UNPAID')
assert.equal(canonicalizeReceiptRows([base, { ...base, reciboId: 'r2' }]).length, 1)
assert.equal(canonicalizeReceiptRows([
  { ...base, reciboId: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
  { ...base, reciboId: 'new', createdAt: '2026-02-01T00:00:00.000Z' },
])[0].reciboId, 'new')
assert.equal(canonicalizeReceiptRows([{ ...base, notificacionId: null }, { ...base, reciboId: 'r2', notificacionId: null }]).length, 1)
assert.equal(reconciliationGroupIdentity({ ...base, category: 'RECONCILED', categoryLabel: 'Conciliado' }, 'executionMonth').key, '2026-06')

assert.deepEqual(classifyBulkItem({ exists: true, validDocument: true, action: 'associateBoleta', diligenceId: 'x', paymentStatus: 'NO_PAGADO', paymentDate: null, proposedPaymentDate: null, boletaNumber: 'OLD', proposedBoletaNumber: 'NEW' }), { disposition: 'eligible', conflict: true, warning: null })
assert.equal(classifyBulkItem({ exists: true, validDocument: true, action: 'markPaid', diligenceId: 'x', paymentStatus: 'PAGADO', paymentDate: 'date', proposedPaymentDate: 'date', boletaNumber: null, proposedBoletaNumber: null }).disposition, 'unchanged')
assert.equal(classifyBulkItem({ exists: true, validDocument: false, action: 'markPaid', diligenceId: 'x', paymentStatus: 'NO_PAGADO', paymentDate: null, proposedPaymentDate: 'date', boletaNumber: null, proposedBoletaNumber: null }).disposition, 'skipped')
assert.equal(receiptBulkStateHash([{ id: 1 }]), receiptBulkStateHash([{ id: 1 }]))
assert.notEqual(receiptBulkStateHash([{ id: 1 }]), receiptBulkStateHash([{ id: 2 }]))

async function verifyWorkbooks() {
  const row = {
    reciboId: 'r1', createdAt: '2026-06-02T12:00:00.000Z', rolId: 'rol1', documentoId: 'doc1', notificacionId: 'n1',
    numeroRecibo: 'R-1', rol: 'C-1-2026', tribunal: 'Tribunal', caratula: 'Caratula', gestion: 'Gestion',
    estampoTemplate: 'Template', estampoTemplateKey: 'wizard:1', resultado: 'Resultado', abogado: 'Abogado',
    procurador: 'Procurador', banco: 'Banco', valor: 20000, fechaRecibo: '2026-06-02T12:00:00.000Z',
    fechaEjecucion: '2026-06-01T12:00:00.000Z', fechaPago: '2026-06-03T12:00:00.000Z', estado: 'Pagado' as const,
    numeroBoleta: 'B-1',
  }
  const management = new ExcelJS.Workbook()
  await management.xlsx.load(await buildRecibosWorkbook([row], 'Monto maximo: 999999999') as any)
  const managementSheet = management.getWorksheet('Recibos')
  assert.ok(managementSheet)
  assert.equal(managementSheet.getCell('A4').value, 'N° Recibo')
  assert.equal(managementSheet.getCell('K5').value, 20000)
  assert.equal(managementSheet.getColumn(11).numFmt, '$#,##0;[Red]-$#,##0')
  assert.ok(managementSheet.getCell('N5').value instanceof Date)

  const reconciliation = new ExcelJS.Workbook()
  await reconciliation.xlsx.load(await buildReconciliationWorkbook({
    rows: [{ ...row, category: 'RECONCILED', categoryLabel: 'Conciliado' }],
    kpis: { total: 1, reconciled: 1, reconciliationPercentage: 100, missingBoleta: 0, pendingPayment: 0, paidWithoutBoleta: 0, totalAmount: 20000 },
    groupBy: 'category', filterSummary: 'Monto maximo: 999999999',
  }) as any)
  const reconciliationSheet = reconciliation.getWorksheet('Conciliacion')
  assert.ok(reconciliationSheet)
  assert.equal(reconciliationSheet.getCell('B8').value, 'N° Recibo')
  assert.equal(reconciliationSheet.getCell('J9').value, 20000)
  assert.equal(reconciliationSheet.getColumn(10).numFmt, '$#,##0;[Red]-$#,##0')
  assert.ok(reconciliationSheet.getCell('M9').value instanceof Date)
}

verifyWorkbooks().then(() => console.log('Phase 6 receipt verification passed.')).catch(error => {
  console.error(error)
  process.exitCode = 1
})
