export type DashboardSection =
  | 'pending'
  | 'overdue'
  | 'unpaid'
  | 'missingEstampos'
  | 'recentDocuments'

export type DashboardFilters = {
  fechaDesde?: string
  fechaHasta?: string
  abogadoIds: number[]
  bancoIds: number[]
  procuradorIds: number[]
}

export type DashboardFilterOption = {
  id: number
  nombre: string
}

export type DashboardNotificationRow = {
  notificacionId: string
  diligenciaId: string
  rolId: string
  rol: string
  fecha: string
  ejecutado: string
  diligenciaTipo: string
  abogado: string
  banco: string
  procurador: string
  workflowStatus: 'nueva' | 'recibo_generado' | 'ejecutada'
  overdueDays: number | null
  incomplete: boolean
  missingFields: string[]
}

export type DashboardReceiptRow = {
  reciboId: string
  documentoId: string
  rolId: string
  rol: string
  numeroRecibo: string
  monto: number
  fechaRecibo: string
  abogado: string
  banco: string
  procurador: string
  numeroBoleta: string | null
}

export type DashboardDocumentRow = {
  documentoId: string
  rolId: string
  rol: string
  nombre: string
  tipo: string
  generatedAt: string
  abogado: string
  banco: string
  procurador: string
}

export type DashboardPayload = {
  filters: DashboardFilters
  generatedAt: string
  timezone: string
  metrics: {
    pending: number
    overdue: number
    unpaid: number
    unpaidAmount: number
    missingEstampos: number
    recentDocuments: number
  }
  rows: {
    pending: DashboardNotificationRow[]
    overdue: DashboardNotificationRow[]
    unpaid: DashboardReceiptRow[]
    missingEstampos: DashboardNotificationRow[]
    recentDocuments: DashboardDocumentRow[]
  }
  options: {
    abogados: DashboardFilterOption[]
    bancos: DashboardFilterOption[]
    procuradores: DashboardFilterOption[]
  }
}

export type QuickActionKind = 'continue' | 'missingRecibo' | 'missingEstampo'
export type QuickActionSort = 'recent' | 'oldest' | 'overdue'

export type QuickActionRow = {
  notificacionId: string
  diligenciaId: string
  rolId: string
  rol: string
  ejecutado: string
  diligenciaTipo: string
  scheduledAt: string
  latestActivityAt: string
  workflowStatus: 'nueva' | 'recibo_generado' | 'ejecutada'
  targetStep: 1 | 2 | 3
  blockers: string[]
  overdueDays: number
}

export type QuickActionPayload = {
  kind: QuickActionKind
  sort: QuickActionSort
  total: number
  rows: QuickActionRow[]
  nextOffset: number | null
}

export type RoleSearchResult = {
  id: string
  rol: string
  tribunal: string
  caratula: string
  abogado: string
  ejecutados: string[]
  bancos: string[]
  estado: string
  matchReasons: string[]
}

export type RoleSearchPayload = {
  query: string
  page: number
  pageSize: 50
  total: number
  totalPages: number
  results: RoleSearchResult[]
}

export type RecentRole = Pick<RoleSearchResult, 'id' | 'rol' | 'tribunal' | 'caratula'>

export type ActivityType =
  | 'all'
  | 'cases'
  | 'diligencias'
  | 'notifications'
  | 'documents'
  | 'payments'
  | 'notes'
  | 'exports'

export type DashboardActivityEvent = {
  id: string
  type: Exclude<ActivityType, 'all'>
  occurredAt: string
  title: string
  detail: string | null
  href: string
  rol: string | null
}

export type DashboardActivityPayload = {
  events: DashboardActivityEvent[]
  nextCursor: string | null
}
