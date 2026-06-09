export type NotificationWorkflowStatus = 'nueva' | 'recibo_generado' | 'ejecutada'

type WorkflowDocument = {
  id?: string | null
  tipo?: string | null
  pdfId?: string | null
  voidedAt?: Date | string | null
  createdAt?: Date | string | null
}

export type NotificationWorkflowState = {
  workflowStatus: NotificationWorkflowStatus
  latestRecibo: WorkflowDocument | null
  latestEstampo: WorkflowDocument | null
  hasReciboPdf: boolean
  hasEstampoPdf: boolean
}

function documentTime(document: WorkflowDocument) {
  const raw = document.createdAt
  if (!raw) return 0

  const date = raw instanceof Date ? raw : new Date(raw)
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

function isValidWorkflowDocument(document: WorkflowDocument, tipo: 'Recibo' | 'Estampo') {
  return document.tipo === tipo && !document.voidedAt && !!document.pdfId
}

function latestValidDocument(documents: WorkflowDocument[], tipo: 'Recibo' | 'Estampo') {
  return documents
    .filter(document => isValidWorkflowDocument(document, tipo))
    .sort((a, b) => documentTime(b) - documentTime(a))[0] ?? null
}

export function deriveNotificationWorkflowState(
  documentsInput: WorkflowDocument[] | null | undefined
): NotificationWorkflowState {
  const documents = Array.isArray(documentsInput) ? documentsInput : []
  const latestRecibo = latestValidDocument(documents, 'Recibo')
  const latestEstampo = latestValidDocument(documents, 'Estampo')
  const hasReciboPdf = !!latestRecibo
  const hasEstampoPdf = !!latestEstampo

  let workflowStatus: NotificationWorkflowStatus = 'nueva'

  if (hasReciboPdf && hasEstampoPdf) {
    workflowStatus = 'ejecutada'
  } else if (hasReciboPdf) {
    workflowStatus = 'recibo_generado'
  }

  return {
    workflowStatus,
    latestRecibo,
    latestEstampo,
    hasReciboPdf,
    hasEstampoPdf,
  }
}
