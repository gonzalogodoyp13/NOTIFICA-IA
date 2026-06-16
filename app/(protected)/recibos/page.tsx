'use client'

import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Filter, Search, X } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { readApiError } from '@/lib/api/client'

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
function todayInput() { return new Date().toISOString().slice(0, 10) }

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
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setFilters(appliedFilters) }, [appliedFilters])
  useEffect(() => {
    fetch('/api/recibos/bulk/recent', { credentials: 'include' }).then(r => r.json()).then(payload => {
      const operation = (payload.data ?? []).find((item: RecentOperation) => item.reversible)
      if (operation) setRecentOperation(operation)
    }).catch(() => undefined)
  }, [])
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

  const templateOptions = options.templates.map(item => ({ id: item.key, nombre: item.label }))
  return <div className="app-shell"><div className="page-stack mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 2xl:px-10">
    <section className="page-section overflow-visible">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="page-kicker">Recibos</div><h1 className="page-title">Gestion de Recibos</h1><p className="page-subtitle">Define los criterios de busqueda antes de cargar resultados. La pagina permanece liviana hasta que presiones Aplicar.</p><div className="mt-4 flex gap-2"><Link href="/recibos" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Gestion</Link><Link href="/recibos/reconciliacion" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Conciliacion</Link></div></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={clear}>Limpiar filtros</Button><Button onClick={exportRows} disabled={!effectiveCount || exporting}>{exporting ? 'Exportando...' : `Exportar (${effectiveCount})`}</Button></div>
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800"><Filter className="h-4 w-4 text-blue-700" />Criterios de busqueda</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MultiSelect label="Estado" options={[{ id: 'PAGADO', nombre: 'Pagado' }, { id: 'NO_PAGADO', nombre: 'Sin pagar' }]} selected={filters.estados} onChange={v => update('estados', v)} />
          <MultiSelect label="Estampo exacto" options={templateOptions} selected={filters.estampoTemplates} onChange={v => update('estampoTemplates', v)} />
          <MultiSelect label="Abogado" options={options.abogados} selected={filters.abogadoIds} onChange={v => update('abogadoIds', v)} />
          <MultiSelect label="Procurador" options={options.procuradores} selected={filters.procuradorIds} onChange={v => update('procuradorIds', v)} />
          <MultiSelect label="Banco" options={options.bancos} selected={filters.bancoIds} onChange={v => update('bancoIds', v)} />
          <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">ROL</span><Input value={filters.rol} onChange={e => update('rol', e.target.value)} placeholder="C-1234-2025" /></label>
          <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Ejecucion desde</span><Input type="date" value={filters.fechaEjecucionDesde} onChange={e => update('fechaEjecucionDesde', e.target.value)} /></label>
          <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Ejecucion hasta</span><Input type="date" value={filters.fechaEjecucionHasta} onChange={e => update('fechaEjecucionHasta', e.target.value)} /></label>
          <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">N° boleta</span><Input value={filters.numeroBoleta} onChange={e => update('numeroBoleta', e.target.value)} placeholder="Numero o fragmento" /></label>
          <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Coincidencia boleta</span><select value={filters.boletaMatch} onChange={e => update('boletaMatch', e.target.value as 'contains' | 'exact')} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3"><option value="contains">Contiene</option><option value="exact">Exacta</option></select></label>
          <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Monto minimo</span><Input type="number" min="0" value={filters.montoMin} onChange={e => update('montoMin', e.target.value)} placeholder="$0" /></label>
          <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Monto maximo</span><Input type="number" min="0" value={filters.montoMax} onChange={e => update('montoMax', e.target.value)} placeholder="Sin limite" /></label>
        </div>
        <div className="mt-5 flex items-center justify-end"><Button onClick={() => apply()} disabled={!hasFilters(filters)}><Search className="mr-2 h-4 w-4" />Aplicar filtros</Button></div>
      </div>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {recentOperation?.reversible && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span>La ultima accion masiva se completo correctamente y puede deshacerse.</span><Button variant="outline" onClick={undoRecent} disabled={bulkUpdating}>Deshacer</Button></div>}
    </section>

    {!applied ? <section className="page-section"><div className="flex min-h-64 flex-col items-center justify-center text-center"><div className="rounded-full bg-blue-50 p-4 text-blue-700"><Filter className="h-8 w-8" /></div><h2 className="mt-4 text-xl font-semibold text-slate-900">Elige como buscar</h2><p className="mt-2 max-w-xl text-slate-600">Selecciona estado, estampo, fecha de ejecucion, boleta, monto u otro criterio. Los recibos se cargaran solo despues de aplicar los filtros.</p></div></section> :
    <section className="page-section overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="text-sm font-semibold text-slate-900">{loading ? 'Cargando recibos...' : `${data?.pagination.totalRows ?? 0} recibos encontrados`}</div><div className="mt-1 text-xs text-slate-500">{effectiveCount} seleccionados</div></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSelection({ mode: 'allFiltered', excludedIds: [] })} disabled={!data?.pagination.totalRows}>Seleccionar todos los resultados</Button>
          <Button variant="outline" onClick={() => setSelection({ mode: 'explicit', ids: [] })} disabled={!effectiveCount}>Quitar seleccion</Button>
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

    {paidOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><div className="page-kicker">Confirmacion</div><h3 className="mt-1 text-xl font-semibold">Marcar recibos como pagados</h3></div><button onClick={() => setPaidOpen(false)}><X /></button></div><label className="mt-5 block space-y-2 text-sm"><span className="font-medium">Fecha de pago</span><Input type="date" max={todayInput()} value={paymentDate} onChange={e => { setPaymentDate(e.target.value); setBulkPreview(null) }} /></label>{bulkPreview?.action === 'markPaid' && <BulkPreviewDetails preview={bulkPreview} />}<div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setPaidOpen(false)}>Cancelar</Button>{bulkPreview?.action === 'markPaid' ? <Button onClick={executeBulk} disabled={!bulkPreview.counts.eligible || bulkUpdating}>{bulkUpdating ? 'Guardando...' : 'Confirmar cambios'}</Button> : <Button onClick={() => previewBulk('markPaid')} disabled={!paymentDate || bulkUpdating}>{bulkUpdating ? 'Revisando...' : 'Revisar cambios'}</Button>}</div></div></div>}
    {boletaOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><div className="page-kicker">Confirmacion</div><h3 className="mt-1 text-xl font-semibold">Asociar N° de boleta</h3></div><button onClick={() => setBoletaOpen(false)}><X /></button></div><label className="mt-5 block space-y-2 text-sm"><span className="font-medium">Numero de boleta</span><Input value={boletaDraft} onChange={e => { setBoletaDraft(e.target.value); setBulkPreview(null) }} autoFocus /></label>{bulkPreview?.action === 'associateBoleta' && <BulkPreviewDetails preview={bulkPreview} />}<div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setBoletaOpen(false)}>Cancelar</Button>{bulkPreview?.action === 'associateBoleta' ? <Button onClick={executeBulk} disabled={!bulkPreview.counts.eligible || bulkUpdating}>{bulkUpdating ? 'Guardando...' : 'Confirmar cambios'}</Button> : <Button onClick={() => previewBulk('associateBoleta')} disabled={!boletaDraft.trim() || bulkUpdating}>{bulkUpdating ? 'Revisando...' : 'Revisar cambios'}</Button>}</div></div></div>}
  </div></div>
}
