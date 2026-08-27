'use client'

import { startTransition, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle, ChevronDown, Filter, FlaskConical, History, Mail, MessageSquare, RefreshCw, RotateCcw, Save, Search, Send, ShieldCheck, X } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { readApiError } from '@/lib/api/client'
import UnmatchedRepliesPanel, {
  type UnmatchedReplyItem,
  type UnmatchedReplyPagination,
  type UnmatchedReplyStatus,
} from './components/UnmatchedRepliesPanel'

const PAGE_SIZE = 25

type Option = { id: string; nombre: string }
type LinkedOption = Option & { bancoIds: string[]; abogadoIds?: string[]; procuradorIds?: string[] }
type TemplateOption = { key: string; label: string; kind: 'wizard' | 'legacy' }
type ReceiptRow = {
  reciboId: string; rolId: string; documentoId: string | null; numeroRecibo: string; rol: string
  tribunal: string; caratula: string; gestion: string; estampoTemplate: string; estampoTemplateKey: string | null
  resultado: string; abogado: string; procurador: string; banco: string; valor: number; fechaRecibo: string
  fechaEjecucion: string | null; fechaPago: string | null; estado: 'Pagado' | 'Sin pagar'; numeroBoleta: string
}
type RecipientMode = 'procurador' | 'abogado' | 'ambos'
type SendRecipient = { recipientType: 'procurador' | 'abogado'; recipientId: number; name: string; email: string | null; validEmail: boolean }
type SendPreviewGroup = {
  groupKey: string; recipientName: string; recipientType: 'Procurador' | 'Abogado' | 'Ambos'; recipients: SendRecipient[]
  reciboIds: string[]; reciboCount: number; totalAmount: number; attachmentFilename: string; subject: string; body: string
  warnings: string[]; canSend: boolean
  intelligence: { requiresConfirmation: boolean; lastSentAt: string | null; previousDispatchId: string | null; overlappingReciboIds: string[]; overlappingCount: number; warning: string | null; overlappingDispatchIds: string[] }
}
type SendPreview = {
  recipientMode: RecipientMode
  template: { key: 'SMART_RECIBOS'; subject: string; body: string; source: 'saved' | 'fallback'; variables: string[]; unknownVariables: string[] }
  groups: SendPreviewGroup[]
  excluded: Array<{ reason: string; count: number; rows: Array<{ reciboId: string; numeroRecibo: string; rol: string; reason: string }> }>
  totals: { selectedRows: number; sendableGroups: number; excludedRows: number }
  cleanupSuggestions: Array<{ recipientType: string; recipientId: number; name: string; problem: string; affectedReciboCount: number; editUrl: string }>
}
type SendDraft = {
  recipients: Record<string, { email: string; saveToRecord: boolean }>
}
type TemplateDraft = { subject: string; body: string }
type SendResult = { dispatchBatchId: string; provider: string; selectedRows: number; groupCount: number; sentCount: number }
type DispatchHistoryItem = {
  id: string; createdAt: string; sentAt: string | null; senderEmail: string; provider: string; fromAccount: string | null
  recipientMode: string; recipientSummary: string; recipientType: string; reciboCount: number; totalAmount: number
  status: string; statusLabel: string; sentCount: number; failedCount: number; skippedCount: number; replyState: string; operationalState: string; dispatchKind: string
  replyCount: number; lastReplyAt: string | null
}
type DispatchHistoryDetail = {
  id: string; createdAt: string; sentAt: string | null; completedAt: string | null; senderEmail: string; provider: string; fromAccount: string | null
  recipientMode: string; status: string; statusLabel: string; selectedCount: number; excludedCount: number; groupCount: number; dispatchKind: string
  sentCount: number; failedCount: number; skippedCount: number; errorMessage: string | null; replyState: string
  replyCount: number; lastReplyAt: string | null
  templateMode: string
  recipients: Array<{
    id: string; recipientType: string; recipientName: string; recipientEmails: string[]; subject: string; body: string
    status: string; statusLabel: string; attemptCount: number; providerMessageId: string | null; providerThreadId: string | null
    attachmentFilename: string | null; attachmentMimeType: string | null; attachmentByteSize: number | null; attachmentSha256: string | null
    reciboCount: number; totalAmount: number; errorMessage: string | null; replyState: string; replyCount: number; lastReplyAt: string | null; operationalState: string
    resolvedAt: string | null; resolutionNote: string | null; resendOfRecipientId: string | null; resendReason: string | null; duplicateOverrideReason: string | null
    replies: Array<{
      id: string; provider: string; senderName: string | null; senderEmail: string; subject: string; textPreview: string
      bodyText: string; receivedAt: string; matchMethod: string | null; suggestedClassification: string | null; confirmedClassification: string | null; classifiedAt: string | null
      attachments: Array<{ id: string; filename: string; mimeType: string | null; byteSize: number | null; isInline: boolean }>
    }>
    items: Array<{ id: string; reciboId: string; numeroRecibo: string; rol: string; monto: number; fechaEjecucion: string | null }>
  }>
}
type ReceiptPayload = {
  rows: ReceiptRow[]
  summary: { totalRowsShown: number; totalValorShown: number }
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number }
}
type FilterState = {
  abogadoIds: string[]; procuradorIds: string[]; bancoIds: string[]; estados: string[]; estampoTemplates: string[]
  rol: string; fechaEjecucionDesde: string; fechaEjecucionHasta: string; numeroBoleta: string
  boletaMatch: 'contains' | 'exact'; montoMin: string; montoMax: string
}
type Selection = { mode: 'explicit'; ids: string[] } | { mode: 'allFiltered'; excludedIds: string[] }
type BulkPreview = {
  action: 'markPaid' | 'associateBoleta'
  items: Array<ReceiptRow & { disposition: 'eligible' | 'unchanged' | 'skipped'; conflict: boolean; warning: string | null; paymentStatus: string | null; paymentDate: string | null; boletaNumber: string | null; proposedPaymentDate: string | null; proposedBoletaNumber: string | null; amount: number; receiptId: string; numeroRecibo: string; rol: string }>
  counts: { eligible: number; skipped: number; unchanged: number; conflicting: number }
  totalEligibleAmount: number
  stateHash: string
}
type RecentOperation = { id: string; action: string; createdAt: string; undoneAt: string | null; reversible: boolean; reason: string | null }
type HistoryPanel = 'dispatch-history' | 'unmatched-replies'

const EMPTY_FILTERS: FilterState = {
  abogadoIds: [], procuradorIds: [], bancoIds: [], estados: [], estampoTemplates: [], rol: '',
  fechaEjecucionDesde: '', fechaEjecucionHasta: '', numeroBoleta: '', boletaMatch: 'contains', montoMin: '', montoMax: '',
}

function parseFilters(params: URLSearchParams): FilterState {
  return {
    abogadoIds: params.getAll('abogadoId'), procuradorIds: params.getAll('procuradorId'), bancoIds: params.getAll('bancoId'),
    estados: params.getAll('estado'), estampoTemplates: params.getAll('estampoTemplate'), rol: params.get('rol') ?? '',
    fechaEjecucionDesde: params.get('fechaEjecucionDesde') ?? '', fechaEjecucionHasta: params.get('fechaEjecucionHasta') ?? '',
    numeroBoleta: params.get('numeroBoleta') ?? '', boletaMatch: params.get('boletaMatch') === 'exact' ? 'exact' : 'contains',
    montoMin: params.get('montoMin') ?? '', montoMax: params.get('montoMax') ?? '',
  }
}

function hasFilters(filters: FilterState) {
  return !!(filters.abogadoIds.length || filters.procuradorIds.length || filters.bancoIds.length || filters.estados.length ||
    filters.estampoTemplates.length || filters.rol.trim() || filters.fechaEjecucionDesde || filters.fechaEjecucionHasta ||
    filters.numeroBoleta.trim() || filters.montoMin || filters.montoMax)
}

function validate(filters: FilterState) {
  if (!hasFilters(filters)) return 'Selecciona al menos un filtro antes de buscar.'
  if (filters.fechaEjecucionDesde && filters.fechaEjecucionHasta && filters.fechaEjecucionDesde > filters.fechaEjecucionHasta) return 'La fecha desde no puede ser mayor que la fecha hasta.'
  const min = filters.montoMin === '' ? undefined : Number(filters.montoMin)
  const max = filters.montoMax === '' ? undefined : Number(filters.montoMax)
  if ((min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max < 0))) return 'Los montos deben ser numeros positivos.'
  if (min !== undefined && max !== undefined && min > max) return 'El monto minimo no puede ser mayor que el monto maximo.'
  return null
}

function buildParams(filters: FilterState, page = 1) {
  const params = new URLSearchParams()
  filters.abogadoIds.forEach(v => params.append('abogadoId', v)); filters.procuradorIds.forEach(v => params.append('procuradorId', v))
  filters.bancoIds.forEach(v => params.append('bancoId', v)); filters.estados.forEach(v => params.append('estado', v))
  filters.estampoTemplates.forEach(v => params.append('estampoTemplate', v))
  if (filters.rol.trim()) params.set('rol', filters.rol.trim())
  if (filters.fechaEjecucionDesde) params.set('fechaEjecucionDesde', filters.fechaEjecucionDesde)
  if (filters.fechaEjecucionHasta) params.set('fechaEjecucionHasta', filters.fechaEjecucionHasta)
  if (filters.numeroBoleta.trim()) { params.set('numeroBoleta', filters.numeroBoleta.trim()); params.set('boletaMatch', filters.boletaMatch) }
  if (filters.montoMin) params.set('montoMin', filters.montoMin); if (filters.montoMax) params.set('montoMax', filters.montoMax)
  params.set('page', String(page)); params.set('pageSize', String(PAGE_SIZE))
  return params
}

function filtersForBody(filters: FilterState) {
  return {
    abogadoIds: filters.abogadoIds, procuradorIds: filters.procuradorIds, bancoIds: filters.bancoIds,
    estados: filters.estados, estampoTemplates: filters.estampoTemplates, rol: filters.rol || undefined,
    fechaEjecucionDesde: filters.fechaEjecucionDesde || undefined, fechaEjecucionHasta: filters.fechaEjecucionHasta || undefined,
    numeroBoleta: filters.numeroBoleta || undefined, boletaMatch: filters.boletaMatch,
    montoMin: filters.montoMin || undefined, montoMax: filters.montoMax || undefined, page: 1, pageSize: PAGE_SIZE,
  }
}

function formatCurrency(value: number) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value) }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '-' }
function formatDateTime(value: string | null) { return value ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '-' }
function todayInput() { return new Date().toISOString().slice(0, 10) }
function recipientKey(recipient: Pick<SendRecipient, 'recipientType' | 'recipientId'>) { return `${recipient.recipientType}:${recipient.recipientId}` }
function basicEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) }
const TEMPLATE_VARIABLES = ['recipient_name', 'recipient_type', 'office_name', 'fecha', 'cantidad_recibos', 'monto_total']

function statusClass(status: string) {
  if (status === 'sent') return 'bg-emerald-100 text-emerald-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  if (status === 'partial') return 'bg-amber-100 text-amber-800'
  if (status === 'sending') return 'bg-blue-100 text-blue-800'
  return 'bg-slate-100 text-slate-700'
}
const OPERATIONAL_LABELS: Record<string, string> = { sent: 'Enviado', failed: 'Fallido', waiting: 'Esperando', overdue: 'Vencido', replied: 'Respondido', resolved: 'Resuelto' }

function MultiSelect({ label, options, selected, onChange }: { label: string; options: Option[]; selected: string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close)
  }, [])
  const names = selected.map(id => options.find(option => option.id === id)?.nombre).filter(Boolean)
  return <div ref={root} className="relative space-y-2 text-sm text-slate-700">
    <span className="font-medium">{label}</span>
    <button type="button" onClick={() => setOpen(value => !value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-left shadow-sm transition hover:border-slate-400">
      <span className="truncate">{names.length ? (names.length === 1 ? names[0] : `${names.length} seleccionados`) : 'Todos'}</span><ChevronDown className="h-4 w-4" />
    </button>
    {open && <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      {selected.length > 0 && <button type="button" onClick={() => onChange([])} className="mb-1 w-full rounded px-2 py-2 text-left text-xs font-semibold text-blue-700 hover:bg-blue-50">Limpiar seleccion</button>}
      {options.length ? options.map(option => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-slate-50">
        <input type="checkbox" checked={selected.includes(option.id)} onChange={() => onChange(selected.includes(option.id) ? selected.filter(id => id !== option.id) : [...selected, option.id])} />
        <span>{option.nombre}</span>
      </label>) : <div className="px-2 py-3 text-slate-500">Sin opciones disponibles</div>}
    </div>}
  </div>
}

function BulkPreviewDetails({ preview }: { preview: BulkPreview }) {
  return <div className="mt-5 space-y-3">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-lg bg-emerald-50 p-3 text-sm"><div className="text-xs text-emerald-700">Elegibles</div><strong>{preview.counts.eligible}</strong></div>
      <div className="rounded-lg bg-amber-50 p-3 text-sm"><div className="text-xs text-amber-700">Cambios previos</div><strong>{preview.counts.conflicting}</strong></div>
      <div className="rounded-lg bg-slate-100 p-3 text-sm"><div className="text-xs text-slate-600">Sin cambios</div><strong>{preview.counts.unchanged}</strong></div>
      <div className="rounded-lg bg-red-50 p-3 text-sm"><div className="text-xs text-red-700">Omitidos</div><strong>{preview.counts.skipped}</strong></div>
    </div>
    <div className="rounded-xl border border-slate-200 p-3 text-sm">Total elegible: <strong>{formatCurrency(preview.totalEligibleAmount)}</strong></div>
    <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
      {preview.items.map(item => <div key={item.receiptId} className="border-b border-slate-100 px-3 py-2 text-sm last:border-0">
        <div className="flex items-center justify-between gap-3"><strong>{item.numeroRecibo}</strong><span className="text-xs text-slate-500">ROL {item.rol}</span></div>
        <div className="mt-1 text-xs text-slate-600">
          {item.disposition === 'skipped' ? item.warning : item.disposition === 'unchanged' ? 'Sin cambios necesarios.' : preview.action === 'markPaid' ? `${item.paymentStatus === 'PAGADO' ? 'Actualiza' : 'Marca'} pago: ${item.proposedPaymentDate?.slice(0, 10)}` : `${item.boletaNumber || 'Sin boleta'} → ${item.proposedBoletaNumber}`}
        </div>
      </div>)}
    </div>
  </div>
}

export default function RecibosPage() {
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams()
  const appliedFilters = useMemo(() => parseFilters(searchParams), [searchParams])
  const applied = hasFilters(appliedFilters)
  const page = Number(searchParams.get('page') ?? 1) || 1
  const [filters, setFilters] = useState<FilterState>(appliedFilters)
  const [options, setOptions] = useState<{ abogados: LinkedOption[]; procuradores: LinkedOption[]; bancos: Option[]; templates: TemplateOption[] }>({ abogados: [], procuradores: [], bancos: [], templates: [] })
  const [data, setData] = useState<ReceiptPayload | null>(null)
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>({ mode: 'explicit', ids: [] })
  const [exporting, setExporting] = useState(false); const [bulkUpdating, setBulkUpdating] = useState(false)
  const [paidOpen, setPaidOpen] = useState(false); const [paymentDate, setPaymentDate] = useState(todayInput())
  const [boletaOpen, setBoletaOpen] = useState(false); const [boletaDraft, setBoletaDraft] = useState('')
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null)
  const [recentOperation, setRecentOperation] = useState<RecentOperation | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendMode, setSendMode] = useState<RecipientMode>('procurador')
  const [sendPreview, setSendPreview] = useState<SendPreview | null>(null)
  const [sendTemplateDraft, setSendTemplateDraft] = useState<TemplateDraft | null>(null)
  const [sendDrafts, setSendDrafts] = useState<Record<string, SendDraft>>({})
  const [sendExpanded, setSendExpanded] = useState<Record<string, boolean>>({})
  const [sendLoading, setSendLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPanel, setHistoryPanel] = useState<HistoryPanel>('dispatch-history')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyItems, setHistoryItems] = useState<DispatchHistoryItem[]>([])
  const [historyDetail, setHistoryDetail] = useState<DispatchHistoryDetail | null>(null)
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false)
  const [replySyncing, setReplySyncing] = useState(false)
  const [replySyncMessage, setReplySyncMessage] = useState<string | null>(null)
  const [unmatchedItems, setUnmatchedItems] = useState<UnmatchedReplyItem[]>([])
  const [unmatchedPagination, setUnmatchedPagination] = useState<UnmatchedReplyPagination>({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [unmatchedPendingTotal, setUnmatchedPendingTotal] = useState(0)
  const [unmatchedStatus, setUnmatchedStatus] = useState<UnmatchedReplyStatus>('all')
  const [unmatchedLoading, setUnmatchedLoading] = useState(false)
  const [unmatchedError, setUnmatchedError] = useState<string | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({})
  const [duplicateReasons, setDuplicateReasons] = useState<Record<string, string>>({})
  const [historyFilter, setHistoryFilter] = useState('all')
  const [providerHealth, setProviderHealth] = useState<Array<{ provider: string; mailboxAddress: string; status: string; lastError: string | null }>>([])
  const [smartActionLoading, setSmartActionLoading] = useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({})
  const [resendRecipientId, setResendRecipientId] = useState<string | null>(null)
  const [resendDraft, setResendDraft] = useState({ emails: '', subject: '', body: '', reason: '' })
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setFilters(appliedFilters) }, [appliedFilters])
  useEffect(() => {
    fetch('/api/recibos/bulk/recent', { credentials: 'include' }).then(r => r.json()).then(payload => {
      const operation = (payload.data ?? []).find((item: RecentOperation) => item.reversible)
      if (operation) setRecentOperation(operation)
    }).catch(() => undefined)
  }, [])
  const loadHistory = async (state = historyFilter) => {
    setHistoryLoading(true)
    try {
      const response = await fetch(`/api/recibos/send/history?limit=20${state !== 'all' ? `&state=${state}` : ''}`, { credentials: 'include' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || payload?.error || 'No se pudo cargar el historial.')
      setHistoryItems(payload.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.')
    } finally {
      setHistoryLoading(false)
    }
  }
  const loadUnmatchedReplies = async (nextPage = unmatchedPagination.page, nextStatus = unmatchedStatus) => {
    setUnmatchedLoading(true); setUnmatchedError(null)
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: '25', status: nextStatus })
      const response = await fetch(`/api/recibos/send/replies/unmatched?${params}`, { credentials: 'include', cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || payload?.error || 'No se pudieron cargar las respuestas pendientes.')
      setUnmatchedItems(payload.data.items ?? [])
      setUnmatchedPagination(payload.data.pagination)
      if (nextStatus === 'all') setUnmatchedPendingTotal(payload.data.pagination.total)
    } catch (e) {
      setUnmatchedError(e instanceof Error ? e.message : 'No se pudieron cargar las respuestas pendientes.')
    } finally {
      setUnmatchedLoading(false)
    }
  }
  const loadUnmatchedCount = async () => {
    try {
      const response = await fetch('/api/recibos/send/replies/unmatched?page=1&limit=1&status=all', { credentials: 'include', cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.ok === true) setUnmatchedPendingTotal(payload.data.pagination.total)
    } catch {
      // The queue exposes its own error state when opened; a badge failure must not break Recibos.
    }
  }
  const loadProviderHealth = async () => {
    const response = await fetch('/api/recibos/send/health', { credentials: 'include' })
    const payload = await response.json().catch(() => null)
    if (response.ok && payload?.ok) setProviderHealth(payload.data)
  }
  const checkHealth = async () => {
    setSmartActionLoading('health')
    try {
      const response = await fetch('/api/recibos/send/health', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!response.ok) throw new Error(await readApiError(response, 'No se pudo comprobar los proveedores.'))
      await loadProviderHealth()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo comprobar los proveedores.') } finally { setSmartActionLoading(null) }
  }
  useEffect(() => { void loadHistory('all'); void loadProviderHealth(); void loadUnmatchedReplies(1, 'all') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Promise.all([
      fetch('/api/abogados', { credentials: 'include' }).then(r => r.json()), fetch('/api/bancos', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/procuradores', { credentials: 'include' }).then(r => r.json()), fetch('/api/recibos/filter-options', { credentials: 'include' }).then(r => r.json()),
    ]).then(([a, b, p, t]) => setOptions({
      abogados: (a.data ?? []).map((item: any) => ({ id: String(item.id), nombre: item.nombre ?? `Abogado ${item.id}`, bancoIds: (item.bancos ?? []).map((x: any) => String(x.banco?.id ?? x.bancoId)), procuradorIds: (item.procuradores ?? []).map((x: any) => String(x.id)) })),
      bancos: (b.data ?? []).map((item: any) => ({ id: String(item.id), nombre: item.nombre })),
      procuradores: (p.data ?? []).map((item: any) => ({ id: String(item.id), nombre: item.nombre, bancoIds: (item.bancos ?? []).map((x: any) => String(x.banco?.id ?? x.bancoId)), abogadoIds: (item.abogadoIds ?? []).map(String) })),
      templates: t.data?.estampoTemplates ?? [],
    })).catch(() => setError('No se pudieron cargar las opciones de filtros.'))
  }, [])

  useEffect(() => {
    if (!applied) { setData(null); setLoading(false); return }
    let ignore = false; setLoading(true); setError(null)
    const params = new URLSearchParams(searchParams.toString()); if (!params.get('pageSize')) params.set('pageSize', String(PAGE_SIZE))
    fetch(`/api/recibos?${params}`, { credentials: 'include' }).then(async response => {
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || 'Error al cargar los recibos.')
      if (!ignore) setData(payload.data)
    }).catch(fetchError => { if (!ignore) setError(fetchError instanceof Error ? fetchError.message : 'Error al cargar los recibos.') }).finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [applied, searchParams])

  const rows = data?.rows ?? []
  const rowSelected = (id: string) => selection.mode === 'allFiltered' ? !selection.excludedIds.includes(id) : selection.ids.includes(id)
  const selectedOnPage = rows.filter(row => rowSelected(row.reciboId)).length
  const allPageSelected = rows.length > 0 && selectedOnPage === rows.length
  const somePageSelected = selectedOnPage > 0 && selectedOnPage < rows.length
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = somePageSelected }, [somePageSelected])
  const effectiveCount = selection.mode === 'allFiltered' ? Math.max(0, (data?.pagination.totalRows ?? 0) - selection.excludedIds.length) : selection.ids.length
  const explicitRows = rows.filter(row => selection.mode === 'explicit' && selection.ids.includes(row.reciboId))
  const explicitTotal = explicitRows.reduce((sum, row) => sum + row.valor, 0)

  const apply = (nextPage = 1, resetSelection = true) => {
    const message = validate(filters); if (message) { setError(message); return }
    setError(null); if (resetSelection) setSelection({ mode: 'explicit', ids: [] })
    startTransition(() => router.replace(`${pathname}?${buildParams(filters, nextPage)}`))
  }
  const clear = () => { setFilters(EMPTY_FILTERS); setData(null); setSelection({ mode: 'explicit', ids: [] }); setError(null); startTransition(() => router.replace(pathname)) }
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) => setFilters(current => ({ ...current, [key]: value }))
  const toggleRow = (id: string) => setSelection(current => current.mode === 'allFiltered'
    ? { mode: 'allFiltered', excludedIds: current.excludedIds.includes(id) ? current.excludedIds.filter(value => value !== id) : [...current.excludedIds, id] }
    : { mode: 'explicit', ids: current.ids.includes(id) ? current.ids.filter(value => value !== id) : [...current.ids, id] })
  const togglePage = () => setSelection(current => {
    const ids = rows.map(row => row.reciboId)
    if (current.mode === 'allFiltered') return { mode: 'allFiltered', excludedIds: allPageSelected ? Array.from(new Set([...current.excludedIds, ...ids])) : current.excludedIds.filter(id => !ids.includes(id)) }
    return { mode: 'explicit', ids: allPageSelected ? current.ids.filter(id => !ids.includes(id)) : Array.from(new Set([...current.ids, ...ids])) }
  })

  const exportRows = async () => {
    if (!effectiveCount) { setError('Selecciona al menos un recibo para exportar.'); return }
    setExporting(true); setError(null)
    try {
      const response = await fetch('/api/recibos/export', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: filtersForBody(appliedFilters), selection: selection.mode === 'explicit' ? { mode: 'explicit', reciboIds: selection.ids } : { mode: 'allFiltered', excludedIds: selection.excludedIds } }) })
      if (!response.ok) { throw new Error(await readApiError(response, 'Error al exportar los recibos.')) }
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = 'gestion-recibos.xlsx'; link.click(); URL.revokeObjectURL(url)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al exportar los recibos.') } finally { setExporting(false) }
  }

  const previewBulk = async (action: 'markPaid' | 'associateBoleta') => {
    if (selection.mode !== 'explicit' || !selection.ids.length) return
    setBulkUpdating(true); setError(null)
    try {
      const response = await fetch('/api/recibos/bulk/preview', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reciboIds: selection.ids, fechaPago: action === 'markPaid' ? paymentDate : undefined, numeroBoleta: action === 'associateBoleta' ? boletaDraft.trim() : undefined }) })
      const payload = await response.json().catch(() => null); if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || 'Error al preparar la vista previa.')
      setBulkPreview(payload.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al preparar la vista previa.') } finally { setBulkUpdating(false) }
  }

  const executeBulk = async () => {
    if (!bulkPreview || selection.mode !== 'explicit') return
    setBulkUpdating(true); setError(null)
    try {
      const response = await fetch('/api/recibos/bulk', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: bulkPreview.action, reciboIds: selection.ids, fechaPago: bulkPreview.action === 'markPaid' ? paymentDate : undefined, numeroBoleta: bulkPreview.action === 'associateBoleta' ? boletaDraft.trim() : undefined, stateHash: bulkPreview.stateHash }) })
      const payload = await response.json().catch(() => null); if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || 'Error al ejecutar la accion.')
      setPaidOpen(false); setBoletaOpen(false); setBulkPreview(null); setBoletaDraft(''); setSelection({ mode: 'explicit', ids: [] })
      setRecentOperation({ id: payload.data.operationId, action: bulkPreview.action, createdAt: new Date().toISOString(), undoneAt: null, reversible: true, reason: null })
      const params = new URLSearchParams(searchParams.toString()); const refreshed = await fetch(`/api/recibos?${params}`, { credentials: 'include' }).then(r => r.json()); if (refreshed.ok) setData(refreshed.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al ejecutar la accion.') } finally { setBulkUpdating(false) }
  }

  const undoRecent = async () => {
    if (!recentOperation?.reversible) return
    setBulkUpdating(true); setError(null)
    try {
      const response = await fetch(`/api/recibos/bulk/${recentOperation.id}/undo`, { method: 'POST', credentials: 'include' })
      const payload = await response.json().catch(() => null); if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || 'No se pudo deshacer la operacion.')
      setRecentOperation(null)
      if (applied) { const refreshed = await fetch(`/api/recibos?${searchParams}`, { credentials: 'include' }).then(r => r.json()); if (refreshed.ok) setData(refreshed.data) }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo deshacer la operacion.') } finally { setBulkUpdating(false) }
  }

  const sendSelectionBody = () => selection.mode === 'explicit'
    ? { mode: 'explicit' as const, reciboIds: selection.ids }
    : { mode: 'allFiltered' as const, excludedIds: selection.excludedIds }

  const buildDrafts = (preview: SendPreview) => Object.fromEntries(preview.groups.map(group => [
    group.groupKey,
    {
      recipients: Object.fromEntries(group.recipients.map(recipient => [
        recipientKey(recipient),
        { email: recipient.email ?? '', saveToRecord: false },
      ])),
    },
  ]))

  const previewSend = async (mode = sendMode, templateOverride?: TemplateDraft | null) => {
    if (!effectiveCount) { setError('Selecciona al menos un recibo para enviar.'); return }
    setSendLoading(true); setSendResult(null); setError(null)
    const template = templateOverride ?? sendTemplateDraft
    try {
      const response = await fetch('/api/recibos/send/preview', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: filtersForBody(appliedFilters), selection: sendSelectionBody(), recipientMode: mode, ...(template ? { template } : {}) }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || payload?.error || 'No se pudo preparar el envio.')
      setSendPreview(payload.data); setSendDrafts(buildDrafts(payload.data)); setSendTemplateDraft({ subject: payload.data.template.subject, body: payload.data.template.body }); setTemplateSaved(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo preparar el envio.'); setSendPreview(null); setSendDrafts({}) }
    finally { setSendLoading(false) }
  }

  const openSendCenter = () => {
    setSendOpen(true); setSendMode('procurador'); setSendExpanded({}); setSendTemplateDraft(null); setTemplateSaved(false); void previewSend('procurador', null)
  }

  const setPanelInUrl = (panel: HistoryPanel | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (panel) params.set('panel', panel)
    else params.delete('panel')
    const query = params.toString()
    window.history.replaceState(window.history.state, '', query ? `${pathname}?${query}` : pathname)
    setHistoryOpen(panel !== null)
    if (panel) setHistoryPanel(panel)
  }

  const openHistory = () => {
    setPanelInUrl('dispatch-history')
  }

  const selectHistoryPanel = (panel: HistoryPanel) => {
    setPanelInUrl(panel)
  }

  const moveHistoryTab = (event: KeyboardEvent<HTMLButtonElement>, panel: HistoryPanel) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    selectHistoryPanel(panel)
    window.requestAnimationFrame(() => document.getElementById(`${panel}-tab`)?.focus())
  }

  const closeHistory = () => {
    setPanelInUrl(null)
  }

  const requestedHistoryPanel = searchParams.get('panel')
  useEffect(() => {
    if (requestedHistoryPanel !== 'dispatch-history' && requestedHistoryPanel !== 'unmatched-replies') {
      setHistoryOpen(false)
      return
    }
    setHistoryOpen(true)
    setHistoryPanel(requestedHistoryPanel)
    if (requestedHistoryPanel === 'dispatch-history') {
      void loadHistory(historyFilter)
    } else {
      setHistoryDetail(null)
      void loadUnmatchedReplies(unmatchedPagination.page, unmatchedStatus)
    }
    void loadProviderHealth()
  }, [requestedHistoryPanel]) // eslint-disable-line react-hooks/exhaustive-deps

  const openHistoryDetail = async (id: string) => {
    setHistoryDetailLoading(true); setError(null)
    try {
      const response = await fetch(`/api/recibos/send/history/${id}`, { credentials: 'include' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || payload?.error || 'No se pudo cargar el detalle.')
      setHistoryDetail(payload.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle.')
    } finally {
      setHistoryDetailLoading(false)
    }
  }

  const syncReplies = async () => {
    if (historyDetail?.provider === 'dry-run') return
    setReplySyncing(true); setReplySyncMessage(null); setError(null)
    try {
      const response = await fetch('/api/recibos/send/replies/sync', { method: 'POST', credentials: 'include' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || payload?.error || 'No se pudieron actualizar las respuestas.')
      const totals = payload.data.totals
      setReplySyncMessage(`Revision completada: ${totals.matched} nuevas, ${totals.duplicates} ya registradas, ${totals.unmatched + totals.needsReview} por revisar.`)
      await Promise.all([
        loadHistory(),
        loadUnmatchedReplies(1, unmatchedStatus),
        ...(unmatchedStatus === 'all' ? [] : [loadUnmatchedCount()]),
      ])
      if (historyDetail) await openHistoryDetail(historyDetail.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron actualizar las respuestas.')
    } finally {
      setReplySyncing(false)
    }
  }

  const classifyReply = async (replyId: string, classification: string) => {
    setSmartActionLoading(replyId)
    try {
      const response = await fetch(`/api/recibos/send/replies/${replyId}/classification`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classification }) })
      if (!response.ok) throw new Error(await readApiError(response, 'No se pudo clasificar la respuesta.'))
      if (historyDetail) await openHistoryDetail(historyDetail.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo clasificar la respuesta.') } finally { setSmartActionLoading(null) }
  }

  const setResolution = async (recipientId: string, resolved: boolean) => {
    setSmartActionLoading(recipientId)
    try {
      const response = await fetch(`/api/recibos/send/history/recipients/${recipientId}/resolution`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolved, note: resolutionNotes[recipientId] || undefined }) })
      if (!response.ok) throw new Error(await readApiError(response, 'No se pudo actualizar la resolucion.'))
      await loadHistory(historyFilter); if (historyDetail) await openHistoryDetail(historyDetail.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar la resolucion.') } finally { setSmartActionLoading(null) }
  }

  const testSend = async (group: SendPreviewGroup) => {
    if (!sendPreview) return
    setSmartActionLoading(`test:${group.groupKey}`)
    try {
      const template = sendTemplateDraft ?? sendPreview.template
      const response = await fetch('/api/recibos/send/test', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: filtersForBody(appliedFilters), selection: sendSelectionBody(), recipientMode: sendMode, template: { subject: template.subject, body: template.body }, groupKey: group.groupKey }) })
      if (!response.ok) throw new Error(await readApiError(response, 'No se pudo enviar la prueba.'))
      setReplySyncMessage('Prueba enviada a tu correo y registrada como envio de prueba.')
      void loadHistory(historyFilter)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar la prueba.') } finally { setSmartActionLoading(null) }
  }

  const openResend = (recipient: DispatchHistoryDetail['recipients'][number]) => {
    setResendRecipientId(recipient.id); setResendDraft({ emails: recipient.recipientEmails.join(', '), subject: recipient.subject, body: recipient.body, reason: '' })
  }

  const executeResend = async () => {
    if (!resendRecipientId) return
    setSmartActionLoading(`resend:${resendRecipientId}`)
    try {
      const response = await fetch(`/api/recibos/send/history/recipients/${resendRecipientId}/resend`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails: resendDraft.emails.split(',').map(value => value.trim()).filter(Boolean), subject: resendDraft.subject, body: resendDraft.body, reason: resendDraft.reason, confirmPartial: true, duplicateConfirmation: { confirmed: true, reason: resendDraft.reason } }) })
      if (!response.ok) throw new Error(await readApiError(response, 'No se pudo reenviar el listado.'))
      setResendRecipientId(null); await loadHistory(historyFilter)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo reenviar el listado.') } finally { setSmartActionLoading(null) }
  }

  const updateDraft = (groupKey: string, updateDraftValue: (draft: SendDraft) => SendDraft) => {
    setSendDrafts(current => {
      const currentDraft = current[groupKey]
      if (!currentDraft) return current
      return { ...current, [groupKey]: updateDraftValue(currentDraft) }
    })
  }

  const updateRecipientDraft = (groupKey: string, key: string, value: Partial<{ email: string; saveToRecord: boolean }>) => updateDraft(groupKey, draft => ({
    ...draft,
    recipients: { ...draft.recipients, [key]: { ...draft.recipients[key], ...value } },
  }))

  const updateTemplateDraft = (value: TemplateDraft, refresh = false) => {
    setSendTemplateDraft(value); setTemplateSaved(false)
    if (refresh && sendPreview) void previewSend(sendMode, value)
  }

  const insertVariable = (field: keyof TemplateDraft, variable: string) => {
    const current = sendTemplateDraft ?? sendPreview?.template ?? { subject: '', body: '' }
    const next = { ...current, [field]: `${current[field]}{${variable}}` }
    updateTemplateDraft(next, true)
  }

  const saveTemplateDefault = async () => {
    const template = sendTemplateDraft ?? sendPreview?.template
    if (!template) return
    setSavingTemplate(true); setTemplateSaved(false); setError(null)
    try {
      const response = await fetch('/api/recibos/send/template', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: template.subject, body: template.body }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || payload?.error || 'No se pudo guardar la plantilla.')
      setSendTemplateDraft({ subject: payload.data.subject, body: payload.data.body }); setTemplateSaved(true)
      if (sendPreview) void previewSend(sendMode, { subject: payload.data.subject, body: payload.data.body })
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la plantilla.') }
    finally { setSavingTemplate(false) }
  }

  const draftValidEmails = (group: SendPreviewGroup) => {
    const draft = sendDrafts[group.groupKey]
    if (!draft) return 0
    return group.recipients.filter(recipient => basicEmail(draft.recipients[recipientKey(recipient)]?.email ?? '')).length
  }

  const executeSend = async () => {
    if (!sendPreview) return
    const groups = sendPreview.groups.map(group => {
      return {
        groupKey: group.groupKey,
        ...(group.intelligence?.requiresConfirmation && duplicateReasons[group.groupKey]?.trim() ? { duplicateConfirmation: { confirmed: true as const, reason: duplicateReasons[group.groupKey].trim() } } : {}),
        recipients: group.recipients.map(recipient => {
          const draft = sendDrafts[group.groupKey]
          const item = draft?.recipients[recipientKey(recipient)]
          return {
            recipientType: recipient.recipientType,
            recipientId: recipient.recipientId,
            email: item?.email ?? recipient.email ?? '',
            saveToRecord: item?.saveToRecord ?? false,
          }
        }),
      }
    }).filter(group => group.recipients.some(recipient => basicEmail(recipient.email)))
    if (!groups.length) { setError('Corrige al menos un email antes de enviar.'); return }
    const template = sendTemplateDraft ?? sendPreview.template
    setSending(true); setError(null); setSendResult(null)
    try {
      const response = await fetch('/api/recibos/send', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: filtersForBody(appliedFilters), selection: sendSelectionBody(), recipientMode: sendMode, template: { subject: template.subject, body: template.body }, groups }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || payload?.error || 'No se pudo enviar el listado.')
      setSendResult(payload.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar el listado.') }
    finally { setSending(false); void loadHistory() }
  }

  return <div className="app-shell"><div className="page-stack mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 2xl:px-10">
    <section className="page-section overflow-visible">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="page-kicker">Recibos</div><h1 className="page-title">Gestion de Recibos</h1><p className="page-subtitle">Define los criterios de busqueda antes de cargar resultados.</p><div className="mt-4 flex gap-2"><Link href="/recibos" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Gestion</Link><Link href="/recibos/reconciliacion" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Conciliacion</Link></div></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={clear}>Limpiar filtros</Button><Button variant="outline" onClick={openHistory}><History className="mr-2 h-4 w-4" />Gestion de envios{unmatchedPendingTotal > 0 && <span aria-label={`${unmatchedPendingTotal} respuestas pendientes`} className="ml-2 inline-flex min-w-5 justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">{unmatchedPendingTotal > 99 ? '99+' : unmatchedPendingTotal}</span>}</Button><Button variant="outline" onClick={openSendCenter} disabled={!effectiveCount || sendLoading}><Send className="mr-2 h-4 w-4" />Enviar listado ({effectiveCount})</Button></div>
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800"><Filter className="h-4 w-4 text-blue-700" />Criterios de busqueda</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MultiSelect label="Estado" options={[{ id: 'PAGADO', nombre: 'Pagado' }, { id: 'NO_PAGADO', nombre: 'Sin pagar' }]} selected={filters.estados} onChange={v => update('estados', v)} />
          <MultiSelect label="Abogado" options={options.abogados} selected={filters.abogadoIds} onChange={v => update('abogadoIds', v)} />
          <MultiSelect label="Procurador" options={options.procuradores} selected={filters.procuradorIds} onChange={v => update('procuradorIds', v)} />
          <MultiSelect label="Banco" options={options.bancos} selected={filters.bancoIds} onChange={v => update('bancoIds', v)} />
          <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">ROL</span><Input value={filters.rol} onChange={e => update('rol', e.target.value)} placeholder="C-1234-2025" /></label>
          <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Ejecucion desde</span><Input type="date" value={filters.fechaEjecucionDesde} onChange={e => update('fechaEjecucionDesde', e.target.value)} /></label>
          <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Ejecucion hasta</span><Input type="date" value={filters.fechaEjecucionHasta} onChange={e => update('fechaEjecucionHasta', e.target.value)} /></label>
        </div>
        <div className="mt-5 flex items-center justify-end"><Button onClick={() => apply()} disabled={!hasFilters(filters)}><Search className="mr-2 h-4 w-4" />Aplicar filtros</Button></div>
      </div>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {recentOperation?.reversible && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span>La ultima accion masiva se completo correctamente y puede deshacerse.</span><Button variant="outline" onClick={undoRecent} disabled={bulkUpdating}>Deshacer</Button></div>}
    </section>

    {!applied ? <section className="page-section"><div className="flex min-h-64 flex-col items-center justify-center text-center"><div className="rounded-full bg-blue-50 p-4 text-blue-700"><Filter className="h-8 w-8" /></div><h2 className="mt-4 text-xl font-semibold text-slate-900">Elige como buscar</h2><p className="mt-2 max-w-xl text-slate-600">Selecciona estado, abogado, procurador, banco, ROL o fecha de ejecucion. Los recibos se cargaran solo despues de aplicar los filtros.</p></div></section> :
    <section className="page-section overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="text-sm font-semibold text-slate-900">{loading ? 'Cargando recibos...' : `${data?.pagination.totalRows ?? 0} recibos encontrados`}</div><div className="mt-1 text-xs text-slate-500">{effectiveCount} seleccionados</div></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportRows} disabled={!effectiveCount || exporting}>{exporting ? 'Exportando...' : `Exportar (${effectiveCount})`}</Button>
          <Button variant="outline" onClick={openSendCenter} disabled={!effectiveCount || sendLoading}><Mail className="mr-2 h-4 w-4" />Enviar listado</Button>
          <Button variant="outline" onClick={() => { setPaymentDate(todayInput()); setBulkPreview(null); setPaidOpen(true) }} disabled={selection.mode !== 'explicit' || !selection.ids.length}>Marcar pagado</Button>
          <Button variant="outline" onClick={() => { setBulkPreview(null); setBoletaOpen(true) }} disabled={selection.mode !== 'explicit' || !selection.ids.length}>Asociar boleta</Button>
        </div>
      </div>
      {selection.mode === 'allFiltered' && <div className="my-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Todos los resultados filtrados estan seleccionados. Puedes excluir filas individuales. Las acciones de pago y boleta requieren una seleccion explicita; la seleccion global se usa para exportar.</div>}
      <div className="overflow-x-auto"><table className="min-w-[2100px] w-full text-sm"><thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
        <th className="px-3 py-3"><input ref={selectAllRef} type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Seleccionar pagina" /></th>
        {['N° Recibo','ROL','Tribunal','Caratula','Gestion','Estampo','Resultado','Abogado','Procurador','Banco','Monto','Estado','N° Boleta','Fecha ejecucion','Fecha recibo','Fecha pago'].map(title => <th key={title} className="px-3 py-3">{title}</th>)}
      </tr></thead><tbody className="divide-y divide-slate-100">
        {!loading && rows.length === 0 && <tr><td colSpan={17} className="px-4 py-16 text-center text-slate-500">No se encontraron recibos con estos filtros.</td></tr>}
        {rows.map(row => <tr key={row.reciboId} className="hover:bg-slate-50/80"><td className="px-3 py-3"><input type="checkbox" checked={rowSelected(row.reciboId)} onChange={() => toggleRow(row.reciboId)} /></td>
          <td className="px-3 py-3 font-semibold text-blue-800">{row.numeroRecibo}</td><td className="px-3 py-3">{row.rol}</td><td className="px-3 py-3">{row.tribunal}</td><td className="px-3 py-3">{row.caratula}</td>
          <td className="px-3 py-3">{row.gestion}</td><td className="px-3 py-3">{row.estampoTemplate}</td><td className="px-3 py-3">{row.resultado}</td><td className="px-3 py-3">{row.abogado}</td>
          <td className="px-3 py-3">{row.procurador}</td><td className="px-3 py-3">{row.banco}</td><td className="px-3 py-3 font-semibold">{formatCurrency(row.valor)}</td>
          <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{row.estado}</span></td>
          <td className="px-3 py-3">{row.numeroBoleta}</td><td className="px-3 py-3">{formatDate(row.fechaEjecucion)}</td><td className="px-3 py-3">{formatDate(row.fechaRecibo)}</td><td className="px-3 py-3">{formatDate(row.fechaPago)}</td>
        </tr>)}
      </tbody></table></div>
      {data && data.pagination.totalPages > 1 && <div className="flex items-center justify-between border-t border-slate-200 pt-4"><Button variant="outline" disabled={page <= 1} onClick={() => apply(page - 1, true)}>Anterior</Button><span className="text-sm text-slate-600">Pagina {page} de {data.pagination.totalPages}</span><Button variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => apply(page + 1, true)}>Siguiente</Button></div>}
    </section>}

    {sendOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div><div className="page-kicker">Centro de envio</div><h3 className="mt-1 text-xl font-semibold text-slate-950">Enviar listado de recibos</h3><p className="mt-1 text-sm text-slate-600">Revisa destinatarios, corrige emails y confirma el envio.</p></div>
            <button type="button" onClick={() => setSendOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {([{ id: 'procurador', label: 'Procurador' }, { id: 'abogado', label: 'Abogado' }, { id: 'ambos', label: 'Ambos' }] as Array<{ id: RecipientMode; label: string }>).map(option =>
              <button key={option.id} type="button" onClick={() => { setSendMode(option.id); void previewSend(option.id) }} className={`rounded-md px-4 py-2 text-sm font-semibold transition ${sendMode === option.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 hover:bg-white'}`}>{option.label}</button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {sendLoading && <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">Preparando vista previa...</div>}
          {!sendLoading && sendPreview && <div className="space-y-4">
            <div className="flex flex-wrap gap-2">{providerHealth.map(item => <span key={item.provider} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === 'healthy' ? 'bg-emerald-100 text-emerald-800' : item.status === 'degraded' || item.status === 'misconfigured' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}><ShieldCheck className="h-3.5 w-3.5" />{item.provider}: {item.status}</span>)}</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-slate-100 p-3 text-sm"><div className="text-xs text-slate-500">Recibos seleccionados</div><strong>{sendPreview.totals.selectedRows}</strong></div>
              <div className="rounded-lg bg-emerald-50 p-3 text-sm"><div className="text-xs text-emerald-700">Grupos con email valido</div><strong>{sendPreview.groups.filter(group => draftValidEmails(group) > 0).length}</strong></div>
              <div className="rounded-lg bg-amber-50 p-3 text-sm"><div className="text-xs text-amber-700">Filas excluidas</div><strong>{sendPreview.totals.excludedRows}</strong></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div><div className="text-sm font-semibold text-slate-950">Plantilla de correo</div><div className="mt-1 text-xs text-slate-500">Origen: {sendPreview.template.source === 'saved' ? 'predeterminada guardada' : 'plantilla base'}</div></div>
                <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={saveTemplateDefault} disabled={savingTemplate || !sendTemplateDraft}><Save className="mr-2 h-4 w-4" />{savingTemplate ? 'Guardando...' : 'Guardar como plantilla predeterminada'}</Button></div>
              </div>
              {templateSaved && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Plantilla predeterminada guardada.</div>}
              {!!sendPreview.template.unknownVariables.length && <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Variables no reconocidas: {sendPreview.template.unknownVariables.map(variable => `{${variable}}`).join(', ')}</span></div>}
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className="space-y-2 text-sm"><span className="font-medium text-slate-700">Asunto</span><Input value={sendTemplateDraft?.subject ?? sendPreview.template.subject} onChange={event => updateTemplateDraft({ subject: event.target.value, body: sendTemplateDraft?.body ?? sendPreview.template.body })} onBlur={() => previewSend(sendMode)} /></label>
                <label className="space-y-2 text-sm"><span className="font-medium text-slate-700">Mensaje</span><textarea value={sendTemplateDraft?.body ?? sendPreview.template.body} onChange={event => updateTemplateDraft({ subject: sendTemplateDraft?.subject ?? sendPreview.template.subject, body: event.target.value })} onBlur={() => previewSend(sendMode)} rows={6} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500" /></label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {TEMPLATE_VARIABLES.map(variable => <button key={variable} type="button" onClick={() => insertVariable('body', variable)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-500">{`{${variable}}`}</button>)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {TEMPLATE_VARIABLES.map(variable => <button key={`subject-${variable}`} type="button" onClick={() => insertVariable('subject', variable)} className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300">Asunto {`{${variable}}`}</button>)}
              </div>
            </div>
            {sendResult && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><CheckCircle className="h-4 w-4" />Envio procesado en modo {sendResult.provider}: {sendResult.sentCount} de {sendResult.groupCount} grupos.</div>}
            {sendPreview.groups.map(group => {
              const draft = sendDrafts[group.groupKey]
              const validEmails = draftValidEmails(group)
              return <div key={group.groupKey} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div><div className="text-sm font-semibold text-slate-950">{group.recipientName}</div><div className="mt-1 text-xs text-slate-500">{group.recipientType} · {group.reciboCount} recibos · {formatCurrency(group.totalAmount)}</div><div className="mt-1 break-all text-xs text-slate-500">{group.attachmentFilename}</div></div>
                  <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${validEmails ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{validEmails ? `${validEmails} email valido` : 'Sin email valido'}</span>
                </div>
                {!!group.warnings.length && <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{group.warnings.join(' · ')}</span></div>}
                {group.intelligence?.lastSentAt && <div className="mt-3 text-xs text-slate-600">Ultimo envio a este destinatario: <strong>{formatDateTime(group.intelligence.lastSentAt)}</strong></div>}
                {group.intelligence?.requiresConfirmation && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3"><div className="flex gap-2 text-sm font-semibold text-red-900"><AlertTriangle className="h-4 w-4 shrink-0" />{group.intelligence.warning}</div><label className="mt-3 block space-y-2 text-xs text-red-900"><span>Motivo obligatorio para continuar</span><Input value={duplicateReasons[group.groupKey] ?? ''} onChange={event => setDuplicateReasons(current => ({ ...current, [group.groupKey]: event.target.value }))} placeholder="Indica por que se enviara nuevamente" /></label></div>}
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {group.recipients.map(recipient => {
                    const key = recipientKey(recipient)
                    const item = draft?.recipients[key] ?? { email: recipient.email ?? '', saveToRecord: false }
                    const valid = basicEmail(item.email)
                    return <div key={key} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-medium text-slate-800">{recipient.recipientType === 'procurador' ? 'Procurador' : 'Abogado'}: {recipient.name}</span><span className={`text-xs font-semibold ${valid ? 'text-emerald-700' : 'text-red-700'}`}>{valid ? 'Valido' : 'Revisar'}</span></div>
                      <Input value={item.email} onChange={event => updateRecipientDraft(group.groupKey, key, { email: event.target.value })} placeholder="correo@dominio.cl" />
                      <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={item.saveToRecord} onChange={event => updateRecipientDraft(group.groupKey, key, { saveToRecord: event.target.checked })} disabled={!valid} />Guardar este email en la ficha</label>
                    </div>
                  })}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Asunto resuelto</div>{group.subject}</div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Mensaje resuelto</div><pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{group.body}</pre></div>
                </div>
                <div className="mt-3 flex justify-end"><Button variant="outline" onClick={() => testSend(group)} disabled={smartActionLoading === `test:${group.groupKey}`}><FlaskConical className="mr-2 h-4 w-4" />{smartActionLoading === `test:${group.groupKey}` ? 'Enviando prueba...' : 'Enviar prueba a mi correo'}</Button></div>
              </div>
            })}
            {!!sendPreview.excluded.length && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-950">Filas excluidas</div>
              <div className="mt-2 space-y-2">
                {sendPreview.excluded.map(item => <div key={item.reason} className="rounded-lg bg-white/70">
                  <button type="button" onClick={() => setSendExpanded(current => ({ ...current, [item.reason]: !current[item.reason] }))} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-amber-950"><span>{item.reason}</span><strong>{item.count}</strong></button>
                  {sendExpanded[item.reason] && <div className="border-t border-amber-100 px-3 py-2 text-xs text-amber-900">{item.rows.map(row => <div key={row.reciboId} className="py-1">{row.numeroRecibo} · ROL {row.rol}</div>)}</div>}
                </div>)}
              </div>
            </div>}
            {!!sendPreview.cleanupSuggestions?.length && <div className="rounded-xl border border-slate-200 p-4"><div className="text-sm font-semibold text-slate-900">Correos que requieren limpieza</div><div className="mt-3 space-y-2">{sendPreview.cleanupSuggestions.map(item => <div key={`${item.recipientType}:${item.recipientId}`} className="flex flex-col gap-2 border-b border-slate-100 pb-2 text-sm last:border-0 sm:flex-row sm:items-center sm:justify-between"><div><strong>{item.name}</strong><span className="ml-2 text-xs text-red-700">{item.problem} · {item.affectedReciboCount} recibos</span></div><Link href={item.editUrl} className="text-xs font-semibold text-blue-700">Corregir ficha</Link></div>)}</div></div>}
          </div>}
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="outline" onClick={() => setSendOpen(false)}>Cancelar</Button>
          <Button variant="outline" onClick={() => previewSend(sendMode)} disabled={sendLoading || sending}>Actualizar vista previa</Button>
          <Button onClick={executeSend} disabled={!sendPreview || sending || sendLoading || !sendPreview.groups.some(group => draftValidEmails(group) > 0) || sendPreview.groups.some(group => group.intelligence?.requiresConfirmation && (duplicateReasons[group.groupKey]?.trim().length ?? 0) < 3)}>{sending ? 'Enviando...' : 'Confirmar envio'}</Button>
        </div>
      </div>
    </div>}

    {historyOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="receipt-delivery-title" className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div><div className="page-kicker">Gestion de envios</div><h3 id="receipt-delivery-title" className="mt-1 text-xl font-semibold text-slate-950">Centro de respuestas y envíos</h3><p className="mt-1 text-sm text-slate-600">Consulta listados enviados y mensajes que necesitan revisión.</p></div>
            <button type="button" aria-label="Cerrar gestión de envíos" onClick={closeHistory} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><X className="h-5 w-5" /></button>
          </div>
          <div role="tablist" aria-label="Secciones de gestión de envíos" className="mt-4 flex gap-1 overflow-x-auto">
            <button id="dispatch-history-tab" type="button" role="tab" aria-controls="dispatch-history-panel" aria-selected={historyPanel === 'dispatch-history'} tabIndex={historyPanel === 'dispatch-history' ? 0 : -1} onKeyDown={event => moveHistoryTab(event, 'unmatched-replies')} onClick={() => selectHistoryPanel('dispatch-history')} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${historyPanel === 'dispatch-history' ? 'border-slate-900 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Envíos</button>
            <button id="unmatched-replies-tab" type="button" role="tab" aria-controls="unmatched-replies-panel" aria-selected={historyPanel === 'unmatched-replies'} tabIndex={historyPanel === 'unmatched-replies' ? 0 : -1} onKeyDown={event => moveHistoryTab(event, 'dispatch-history')} onClick={() => selectHistoryPanel('unmatched-replies')} className={`inline-flex items-center whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${historyPanel === 'unmatched-replies' ? 'border-amber-600 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Respuestas por asociar<span aria-label={`${unmatchedPendingTotal} respuestas pendientes`} className="ml-2 inline-flex min-w-6 justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">{unmatchedPendingTotal > 99 ? '99+' : unmatchedPendingTotal}</span></button>
          </div>
        </div>
        {historyPanel === 'dispatch-history' && <div id="dispatch-history-panel" role="tabpanel" aria-labelledby="dispatch-history-tab" className="grid flex-1 overflow-hidden lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="overflow-y-auto border-r border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><div className="text-sm font-semibold text-slate-900">Control inteligente</div><div className="flex gap-2"><Button variant="outline" onClick={() => loadHistory(historyFilter)} disabled={historyLoading}>{historyLoading ? 'Cargando...' : 'Actualizar'}</Button><Button variant="outline" onClick={syncReplies} disabled={replySyncing || historyDetail?.provider === 'dry-run'}><RefreshCw className={`mr-2 h-4 w-4 ${replySyncing ? 'animate-spin' : ''}`} />{replySyncing ? 'Revisando...' : 'Actualizar respuestas'}</Button></div></div>
            <div className="mb-3 flex flex-wrap gap-1">{[{ id: 'all', label: 'Todos' }, { id: 'sent', label: 'Enviados' }, { id: 'failed', label: 'Fallidos' }, { id: 'waiting', label: 'Esperando' }, { id: 'overdue', label: 'Vencidos' }, { id: 'replied', label: 'Respondidos' }, { id: 'resolved', label: 'Resueltos' }].map(option => <button key={option.id} type="button" onClick={() => { setHistoryFilter(option.id); setHistoryDetail(null); void loadHistory(option.id) }} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${historyFilter === option.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{option.label}</button>)}</div>
            <div className="mb-3 flex flex-wrap items-center gap-2">{providerHealth.map(item => <span key={`history-${item.provider}`} className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'healthy' ? 'bg-emerald-100 text-emerald-800' : item.status === 'degraded' || item.status === 'misconfigured' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>{item.provider}: {item.status}</span>)}<button type="button" onClick={checkHealth} disabled={smartActionLoading === 'health'} className="text-xs font-semibold text-blue-700">{smartActionLoading === 'health' ? 'Comprobando...' : 'Comprobar proveedores'}</button></div>
            {replySyncMessage && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{replySyncMessage}</div>}
            {!historyLoading && !historyItems.length && <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">Aun no hay envios registrados.</div>}
            <div className="space-y-3">
              {historyItems.map(item => <button key={item.id} type="button" onClick={() => openHistoryDetail(item.id)} className={`w-full rounded-xl border p-4 text-left transition hover:border-slate-400 ${historyDetail?.id === item.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-950">{item.recipientSummary || 'Sin destinatario'}</div><div className="mt-1 text-xs text-slate-500">{formatDateTime(item.sentAt ?? item.createdAt)} · {item.senderEmail}{item.dispatchKind !== 'standard' ? ` · ${item.dispatchKind}` : ''}</div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.operationalState === 'overdue' ? 'partial' : item.operationalState === 'waiting' ? 'sending' : item.operationalState === 'replied' || item.operationalState === 'resolved' ? 'sent' : item.status)}`}>{OPERATIONAL_LABELS[item.operationalState] ?? item.statusLabel}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600"><div>{item.reciboCount} recibos</div><div>{formatCurrency(item.totalAmount)}</div><div>{item.provider}{item.fromAccount ? ` · ${item.fromAccount}` : ''}</div><div className={item.replyCount ? 'font-semibold text-emerald-700' : ''}>{item.replyState}{item.lastReplyAt ? ` · ${formatDateTime(item.lastReplyAt)}` : ''}</div></div>
              </button>)}
            </div>
          </div>
          <div className="overflow-y-auto p-4">
            {historyDetailLoading && <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">Cargando detalle...</div>}
            {!historyDetailLoading && !historyDetail && <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">Selecciona un envio para ver destinatarios, recibos y metadatos.</div>}
            {!historyDetailLoading && historyDetail && <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-semibold text-slate-950">Envio {historyDetail.id}</div><div className="mt-1 text-xs text-slate-500">{formatDateTime(historyDetail.sentAt ?? historyDetail.createdAt)} · {historyDetail.senderEmail}</div></div><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(historyDetail.status)}`}>{historyDetail.statusLabel}</span></div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><span className="text-xs text-slate-500">Proveedor</span><div>{historyDetail.provider}</div></div><div><span className="text-xs text-slate-500">Cuenta envio</span><div className="break-all">{historyDetail.fromAccount ?? '-'}</div></div><div><span className="text-xs text-slate-500">Respuestas</span><div>{historyDetail.replyState}</div></div><div><span className="text-xs text-slate-500">Recibos</span><div>{historyDetail.selectedCount}</div></div><div><span className="text-xs text-slate-500">Enviados</span><div>{historyDetail.sentCount}</div></div><div><span className="text-xs text-slate-500">Fallidos / omitidos</span><div>{historyDetail.failedCount} / {historyDetail.skippedCount}</div></div></div>
                {historyDetail.errorMessage && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{historyDetail.errorMessage}</div>}
              </div>
              {historyDetail.recipients.map(recipient => <div key={recipient.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-semibold text-slate-950">{recipient.recipientName}</div><div className="mt-1 text-xs text-slate-500">{recipient.recipientType} · {recipient.reciboCount} recibos · {formatCurrency(recipient.totalAmount)}</div><div className="mt-1 break-all text-xs text-slate-500">{recipient.recipientEmails.join(', ')}</div></div><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(recipient.operationalState === 'overdue' ? 'partial' : recipient.operationalState === 'waiting' ? 'sending' : recipient.operationalState === 'replied' || recipient.operationalState === 'resolved' ? 'sent' : recipient.status)}`}>{OPERATIONAL_LABELS[recipient.operationalState] ?? recipient.statusLabel}</span></div>
                <div className="mt-3 grid gap-3 text-xs text-slate-600 sm:grid-cols-2"><div><span className="font-semibold text-slate-700">Message ID:</span> {recipient.providerMessageId ?? '-'}</div><div><span className="font-semibold text-slate-700">Thread ID:</span> {recipient.providerThreadId ?? '-'}</div><div><span className="font-semibold text-slate-700">Intentos:</span> {recipient.attemptCount}</div><div><span className="font-semibold text-slate-700">Respuestas:</span> {recipient.replyState}{recipient.lastReplyAt ? ` · ${formatDateTime(recipient.lastReplyAt)}` : ''}</div><div className="break-all sm:col-span-2"><span className="font-semibold text-slate-700">Adjunto:</span> {recipient.attachmentFilename ?? '-'} {recipient.attachmentByteSize ? `(${recipient.attachmentByteSize} bytes)` : ''}</div><div className="break-all sm:col-span-2"><span className="font-semibold text-slate-700">SHA-256:</span> {recipient.attachmentSha256 ?? '-'}</div></div>
                {recipient.errorMessage && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{recipient.errorMessage}</div>}
                {recipient.duplicateOverrideReason && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Duplicado confirmado: {recipient.duplicateOverrideReason}</div>}
                {recipient.resendOfRecipientId && <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">Reenvio vinculado a {recipient.resendOfRecipientId}. Motivo: {recipient.resendReason}</div>}
                <div className="mt-4 grid gap-3 lg:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Asunto usado</div>{recipient.subject}</div><div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Mensaje usado</div><pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{recipient.body}</pre></div></div>
                <div className="mt-4 border-t border-slate-200 pt-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquare className="h-4 w-4 text-emerald-700" />Respuestas ({recipient.replyCount})</div>{!recipient.replies.length ? <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">Sin respuestas recibidas.</div> : <div className="space-y-3">{recipient.replies.map(reply => <div key={reply.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-semibold text-slate-900">{reply.subject || 'Sin asunto'}</div><div className="mt-1 text-xs text-slate-500">{reply.senderName ? `${reply.senderName} · ` : ''}{reply.senderEmail} · {formatDateTime(reply.receivedAt)}</div></div><button type="button" onClick={() => setExpandedReplies(current => ({ ...current, [reply.id]: !current[reply.id] }))} className="text-xs font-semibold text-blue-700 hover:text-blue-900">{expandedReplies[reply.id] ? 'Ocultar respuesta' : 'Leer respuesta completa'}</button></div><div className="mt-3 text-sm text-slate-700">{expandedReplies[reply.id] ? <pre className="whitespace-pre-wrap font-sans text-sm">{reply.bodyText}</pre> : reply.textPreview}</div><div className="mt-3 flex flex-wrap items-center gap-2"><select value={reply.confirmedClassification ?? reply.suggestedClassification ?? 'otro'} onChange={event => classifyReply(reply.id, event.target.value)} disabled={smartActionLoading === reply.id} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs"><option value="recibido">Recibido</option><option value="observado">Observado</option><option value="requiere_correccion">Requiere correccion</option><option value="pago_informado">Pago informado</option><option value="otro">Otro</option></select><span className="text-xs text-slate-500">{reply.confirmedClassification ? 'Clasificacion confirmada' : 'Sugerencia automatica'}</span></div>{!!reply.attachments.length && <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600"><div className="font-semibold text-slate-700">Adjuntos</div>{reply.attachments.map(attachment => <div key={attachment.id} className="mt-1">{attachment.filename}{attachment.mimeType ? ` · ${attachment.mimeType}` : ''}{attachment.byteSize ? ` · ${attachment.byteSize} bytes` : ''}</div>)}</div>}</div>)}</div>}</div>
                <div className="mt-4 border-t border-slate-200 pt-4"><div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input value={resolutionNotes[recipient.id] ?? recipient.resolutionNote ?? ''} onChange={event => setResolutionNotes(current => ({ ...current, [recipient.id]: event.target.value }))} placeholder="Nota de resolucion" /><Button variant="outline" onClick={() => setResolution(recipient.id, !recipient.resolvedAt)} disabled={smartActionLoading === recipient.id}>{recipient.resolvedAt ? 'Reabrir' : 'Marcar resuelto'}</Button><Button variant="outline" onClick={() => openResend(recipient)}><RotateCcw className="mr-2 h-4 w-4" />Reenviar</Button></div></div>
                <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-xs"><thead><tr className="bg-slate-50 text-left text-slate-600"><th className="px-2 py-2">Recibo</th><th className="px-2 py-2">ROL</th><th className="px-2 py-2">Monto</th><th className="px-2 py-2">Ejecucion</th></tr></thead><tbody className="divide-y divide-slate-100">{recipient.items.map(item => <tr key={item.id}><td className="px-2 py-2 font-semibold text-blue-800">{item.numeroRecibo}</td><td className="px-2 py-2">{item.rol}</td><td className="px-2 py-2">{formatCurrency(item.monto)}</td><td className="px-2 py-2">{formatDate(item.fechaEjecucion)}</td></tr>)}</tbody></table></div>
              </div>)}
            </div>}
          </div>
        </div>}
        {historyPanel === 'unmatched-replies' && <div id="unmatched-replies-panel" role="tabpanel" aria-labelledby="unmatched-replies-tab" className="min-h-0 flex-1 overflow-hidden"><UnmatchedRepliesPanel
          items={unmatchedItems}
          pagination={unmatchedPagination}
          status={unmatchedStatus}
          loading={unmatchedLoading}
          error={unmatchedError}
          onStatusChange={status => { setUnmatchedStatus(status); void loadUnmatchedReplies(1, status) }}
          onPageChange={nextPage => void loadUnmatchedReplies(nextPage, unmatchedStatus)}
          onRefresh={() => void loadUnmatchedReplies(unmatchedPagination.page, unmatchedStatus)}
        /></div>}
      </div>
    </div>}

    {resendRecipientId && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><div className="page-kicker">Reenvio vinculado</div><h3 className="mt-1 text-lg font-semibold">Reenviar listado</h3></div><button type="button" onClick={() => setResendRecipientId(null)} className="p-2"><X className="h-5 w-5" /></button></div><div className="mt-4 space-y-3"><label className="block space-y-1 text-sm"><span>Destinatarios</span><Input value={resendDraft.emails} onChange={event => setResendDraft(current => ({ ...current, emails: event.target.value }))} /></label><label className="block space-y-1 text-sm"><span>Asunto</span><Input value={resendDraft.subject} onChange={event => setResendDraft(current => ({ ...current, subject: event.target.value }))} /></label><label className="block space-y-1 text-sm"><span>Mensaje</span><textarea rows={6} value={resendDraft.body} onChange={event => setResendDraft(current => ({ ...current, body: event.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="block space-y-1 text-sm"><span>Motivo obligatorio</span><Input value={resendDraft.reason} onChange={event => setResendDraft(current => ({ ...current, reason: event.target.value }))} placeholder="Motivo del reenvio" /></label></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setResendRecipientId(null)}>Cancelar</Button><Button onClick={executeResend} disabled={resendDraft.reason.trim().length < 3 || smartActionLoading === `resend:${resendRecipientId}`}>{smartActionLoading === `resend:${resendRecipientId}` ? 'Reenviando...' : 'Confirmar reenvio'}</Button></div></div></div>}

    {paidOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><div className="page-kicker">Confirmacion</div><h3 className="mt-1 text-xl font-semibold">Marcar recibos como pagados</h3></div><button onClick={() => setPaidOpen(false)}><X /></button></div><label className="mt-5 block space-y-2 text-sm"><span className="font-medium">Fecha de pago</span><Input type="date" max={todayInput()} value={paymentDate} onChange={e => { setPaymentDate(e.target.value); setBulkPreview(null) }} /></label>{bulkPreview?.action === 'markPaid' && <BulkPreviewDetails preview={bulkPreview} />}<div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setPaidOpen(false)}>Cancelar</Button>{bulkPreview?.action === 'markPaid' ? <Button onClick={executeBulk} disabled={!bulkPreview.counts.eligible || bulkUpdating}>{bulkUpdating ? 'Guardando...' : 'Confirmar cambios'}</Button> : <Button onClick={() => previewBulk('markPaid')} disabled={!paymentDate || bulkUpdating}>{bulkUpdating ? 'Revisando...' : 'Revisar cambios'}</Button>}</div></div></div>}
    {boletaOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><div className="page-kicker">Confirmacion</div><h3 className="mt-1 text-xl font-semibold">Asociar N° de boleta</h3></div><button onClick={() => setBoletaOpen(false)}><X /></button></div><label className="mt-5 block space-y-2 text-sm"><span className="font-medium">Numero de boleta</span><Input value={boletaDraft} onChange={e => { setBoletaDraft(e.target.value); setBulkPreview(null) }} autoFocus /></label>{bulkPreview?.action === 'associateBoleta' && <BulkPreviewDetails preview={bulkPreview} />}<div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setBoletaOpen(false)}>Cancelar</Button>{bulkPreview?.action === 'associateBoleta' ? <Button onClick={executeBulk} disabled={!bulkPreview.counts.eligible || bulkUpdating}>{bulkUpdating ? 'Guardando...' : 'Confirmar cambios'}</Button> : <Button onClick={() => previewBulk('associateBoleta')} disabled={!boletaDraft.trim() || bulkUpdating}>{bulkUpdating ? 'Revisando...' : 'Revisar cambios'}</Button>}</div></div></div>}
  </div></div>
}
