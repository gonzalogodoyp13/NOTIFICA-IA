import { createHash } from 'crypto'

export function receiptBulkStateHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function classifyBulkItem(params: {
  exists: boolean; validDocument: boolean; action: 'markPaid' | 'associateBoleta'; diligenceId: string | null
  paymentStatus: string | null; paymentDate: string | null; proposedPaymentDate: string | null
  boletaNumber: string | null; proposedBoletaNumber: string | null
}) {
  if (!params.exists) return { disposition: 'skipped' as const, conflict: false, warning: 'El recibo no existe o no pertenece a tu oficina.' }
  if (!params.validDocument) return { disposition: 'skipped' as const, conflict: false, warning: 'El documento fue anulado, eliminado o no tiene PDF vigente.' }
  if (params.action === 'markPaid' && !params.diligenceId) return { disposition: 'skipped' as const, conflict: false, warning: 'El recibo no tiene diligencia asociada.' }
  if (params.action === 'markPaid' && params.paymentStatus === 'PAGADO' && params.paymentDate === params.proposedPaymentDate) return { disposition: 'unchanged' as const, conflict: false, warning: null }
  if (params.action === 'associateBoleta' && params.boletaNumber === params.proposedBoletaNumber) return { disposition: 'unchanged' as const, conflict: false, warning: null }
  return { disposition: 'eligible' as const, conflict: params.action === 'markPaid' ? params.paymentStatus === 'PAGADO' : !!params.boletaNumber, warning: null }
}
