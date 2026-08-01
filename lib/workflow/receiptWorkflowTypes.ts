export type ReceiptWorkflowSelection =
  | { kind: 'CUSTOM'; estampoId: string }
  | { kind: 'WIZARD'; categoria: string; estampoBaseId?: number }

export type ReceiptWorkflowArancel = {
  bancoId: number
  monto: number
  source: 'abogado' | 'banco'
}

export type ReceiptWorkflowEstampoOption = {
  selection: ReceiptWorkflowSelection
  label: string
  contenido?: string | null
  count?: number
  aranceles: ReceiptWorkflowArancel[]
}

export type ReceiptWorkflowData = {
  notification: Record<string, unknown>
  ejecutado: {
    id: string
    nombre: string
    direccion: string | null
    comuna: { id: number; nombre: string } | null
  }
  bankContext: {
    selectedBankId: number | null
    banks: Array<{ id: number; nombre: string }>
  }
  execution: { fecha: string | null; hora: string | null }
  selectedEstampoTipo: ReceiptWorkflowSelection | null
  monto: number | null
  estampoOptions: ReceiptWorkflowEstampoOption[]
  receiptState: {
    receiptId: string
    documentoId: string | null
    numeroRecibo: string
    generationFingerprint: string | null
  } | null
  historicalSelection: {
    selection: ReceiptWorkflowSelection
    label: string
    active: false
  } | null
}

