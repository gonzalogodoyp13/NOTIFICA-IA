'use client'

import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FileText,
  RefreshCw,
  Search,
  Stamp,
  WifiOff,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {
  DashboardDocumentRow,
  DashboardFilterOption,
  DashboardFilters,
  DashboardNotificationRow,
  DashboardPayload,
  DashboardReceiptRow,
  DashboardSection,
} from '@/lib/dashboard/types'
import DashboardSearch from './DashboardSearch'
import QuickActionsPanel from './QuickActionsPanel'
import ActivityFeed from './ActivityFeed'

type DraftFilters = {
  fechaDesde: string
  fechaHasta: string
  abogadoIds: string[]
  bancoIds: string[]
  procuradorIds: string[]
}

type MultiSelectProps = {
  label: string
  options: DashboardFilterOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

const sectionMeta: Record<DashboardSection, {
  title: string
  subtitle: string
  empty: string
}> = {
  pending: {
    title: 'Notificaciones pendientes',
    subtitle: 'Programadas, de la mas nueva a la mas antigua.',
    empty: 'No hay notificaciones pendientes con estos filtros.',
  },
  overdue: {
    title: 'Atrasos mayores a 14 dias',
    subtitle: 'Las mas antiguas aparecen primero.',
    empty: 'No hay notificaciones con atrasos mayores a 14 dias.',
  },
  unpaid: {
    title: 'Recibos sin pagar',
    subtitle: 'Documentos vigentes pendientes de pago.',
    empty: 'No hay recibos sin pagar con estos filtros.',
  },
  missingEstampos: {
    title: 'Estampos pendientes',
    subtitle: 'Notificaciones con recibo vigente y sin estampo.',
    empty: 'No faltan estampos con estos filtros.',
  },
  recentDocuments: {
    title: 'Documentos recientes',
    subtitle: 'Recibos y estampos generados durante los ultimos 7 dias.',
    empty: 'No se generaron documentos recientes con estos filtros.',
  },
}

const missingFieldLabels: Record<string, string> = {
  ejecutado: 'ejecutado',
  address: 'direccion',
  comuna: 'comuna',
  abogado: 'abogado',
  banco: 'banco',
  arancel: 'arancel',
  estampo_type: 'tipo de estampo',
}

function parseFilters(searchParams: URLSearchParams): DraftFilters {
  return {
    fechaDesde: searchParams.get('fechaDesde') ?? '',
    fechaHasta: searchParams.get('fechaHasta') ?? '',
    abogadoIds: searchParams.getAll('abogadoId'),
    bancoIds: searchParams.getAll('bancoId'),
    procuradorIds: searchParams.getAll('procuradorId'),
  }
}

function buildQuery(filters: DraftFilters, section?: DashboardSection) {
  const params = new URLSearchParams()
  if (filters.fechaDesde) params.set('fechaDesde', filters.fechaDesde)
  if (filters.fechaHasta) params.set('fechaHasta', filters.fechaHasta)
  filters.abogadoIds.forEach(id => params.append('abogadoId', id))
  filters.bancoIds.forEach(id => params.append('bancoId', id))
  filters.procuradorIds.forEach(id => params.append('procuradorId', id))
  if (section) params.set('section', section)
  return params.toString()
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string, includeTime = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' } : {}),
  }).format(date)
}

function workflowLabel(status: DashboardNotificationRow['workflowStatus']) {
  if (status === 'ejecutada') return 'Flujo completo'
  if (status === 'recibo_generado') return 'Recibo generado'
  return 'Sin recibo'
}

function MultiSelect({ label, options, selectedIds, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const selectedNames = options
    .filter(option => selectedIds.includes(String(option.id)))
    .map(option => option.nombre)
  const text = selectedNames.length === 0
    ? 'Todos'
    : selectedNames.length === 1
      ? selectedNames[0]
      : `${selectedNames.length} seleccionados`

  return (
    <div ref={rootRef} className="relative">
      <label className="field-label">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 shadow-sm hover:border-slate-300"
      >
        <span className="truncate">{text}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-full min-w-[240px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-2 pb-2 text-xs text-slate-500">
            <span>{selectedIds.length ? `${selectedIds.length} activos` : 'Sin filtro'}</span>
            <button type="button" onClick={() => onChange([])} className="font-semibold text-blue-700">
              Limpiar
            </button>
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto">
            {options.map(option => {
              const id = String(option.id)
              const checked = selectedIds.includes(id)
              return (
                <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onChange(checked ? selectedIds.filter(value => value !== id) : [...selectedIds, id])}
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>{option.nombre}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationTable({ rows, overdue }: { rows: DashboardNotificationRow[]; overdue?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          <tr>
            <th className="px-5 py-3">Fecha</th>
            <th className="px-5 py-3">ROL / Ejecutado</th>
            <th className="px-5 py-3">Gestion</th>
            <th className="px-5 py-3">Responsables</th>
            <th className="px-5 py-3">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map(row => (
            <tr key={row.notificacionId} className="hover:bg-slate-50/80">
              <td className="whitespace-nowrap px-5 py-4 align-top">
                <div className="font-semibold text-slate-900">{formatDate(row.fecha)}</div>
                {overdue && row.overdueDays !== null && (
                  <div className="mt-1 text-xs font-semibold text-rose-700">{row.overdueDays} dias de atraso</div>
                )}
              </td>
              <td className="px-5 py-4 align-top">
                <Link href={`/roles/${row.rolId}`} className="font-semibold text-blue-700 hover:underline">
                  {row.rol}
                </Link>
                <div className="mt-1 text-slate-600">{row.ejecutado}</div>
              </td>
              <td className="px-5 py-4 align-top text-slate-700">{row.diligenciaTipo}</td>
              <td className="px-5 py-4 align-top text-slate-600">
                <div>{row.abogado}</div>
                <div className="mt-1 text-xs">{row.banco}</div>
                <div className="mt-1 text-xs">{row.procurador}</div>
              </td>
              <td className="px-5 py-4 align-top">
                <span className="status-pill border-sky-200 bg-sky-50 text-sky-700">
                  {workflowLabel(row.workflowStatus)}
                </span>
                {row.incomplete && (
                  <div className="mt-2 max-w-xs text-xs leading-5 text-amber-700">
                    Datos incompletos: {row.missingFields.map(field => missingFieldLabels[field] ?? field).join(', ')}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReceiptTable({ rows }: { rows: DashboardReceiptRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          <tr>
            <th className="px-5 py-3">Recibo</th>
            <th className="px-5 py-3">ROL</th>
            <th className="px-5 py-3">Fecha</th>
            <th className="px-5 py-3">Responsables</th>
            <th className="px-5 py-3 text-right">Monto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map(row => (
            <tr key={row.reciboId} className="hover:bg-slate-50/80">
              <td className="px-5 py-4 align-top">
                <a
                  href={`/api/documentos/${row.documentoId}/download?mode=inline`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-blue-700 hover:underline"
                >
                  {row.numeroRecibo}
                </a>
                <div className="mt-1 text-xs text-slate-500">Boleta: {row.numeroBoleta || 'Sin asociar'}</div>
              </td>
              <td className="px-5 py-4 align-top">
                <Link href={`/roles/${row.rolId}`} className="font-semibold text-slate-900 hover:text-blue-700">
                  {row.rol}
                </Link>
              </td>
              <td className="whitespace-nowrap px-5 py-4 align-top text-slate-600">{formatDate(row.fechaRecibo)}</td>
              <td className="px-5 py-4 align-top text-slate-600">
                <div>{row.abogado}</div>
                <div className="mt-1 text-xs">{row.banco}</div>
                <div className="mt-1 text-xs">{row.procurador}</div>
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right align-top font-semibold text-slate-950">
                {formatCurrency(row.monto)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DocumentsTable({ rows }: { rows: DashboardDocumentRow[] }) {
  return (
    <div className="divide-y divide-slate-100 bg-white">
      {rows.map(row => (
        <div key={row.documentoId} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50/80">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="status-pill border-slate-200 bg-slate-50 text-slate-600">{row.tipo}</span>
              <a
                href={`/api/documentos/${row.documentoId}/download?mode=inline`}
                target="_blank"
                rel="noreferrer"
                className="truncate font-semibold text-blue-700 hover:underline"
              >
                {row.nombre}
              </a>
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {row.abogado} · {row.banco} · {row.procurador}
            </div>
          </div>
          <div className="text-right">
            <Link href={`/roles/${row.rolId}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
              {row.rol}
            </Link>
            <div className="mt-1 text-xs text-slate-500">{formatDate(row.generatedAt, true)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DashboardCockpit() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const appliedFilters = useMemo(() => parseFilters(searchParams), [searchParams])
  const [draftFilters, setDraftFilters] = useState(appliedFilters)
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [activeSection, setActiveSection] = useState<DashboardSection>('pending')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(true)

  useEffect(() => setDraftFilters(appliedFilters), [appliedFilters])

  const fetchDashboard = useCallback(async (background = false, section = activeSection) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOnline(false)
      return
    }

    background ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const query = buildQuery(appliedFilters, section)
      const response = await fetch(`/api/dashboard${query ? `?${query}` : ''}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error || 'No se pudo cargar el panel operativo.')
      }
      setData(payload.data)
      setOnline(true)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudo cargar el panel operativo.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeSection, appliedFilters])

  useEffect(() => {
    fetchDashboard(false)
  }, [fetchDashboard])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchDashboard(true)
    }
    const handleOnline = () => {
      setOnline(true)
      fetchDashboard(true)
    }
    const handleOffline = () => setOnline(false)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) fetchDashboard(true)
    }, 60_000)

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [fetchDashboard])

  const applyFilters = () => {
    if (draftFilters.fechaDesde && draftFilters.fechaHasta && draftFilters.fechaDesde > draftFilters.fechaHasta) {
      setError('La fecha desde no puede ser posterior a la fecha hasta.')
      return
    }
    const query = buildQuery(draftFilters)
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname))
  }

  const clearFilters = () => {
    const empty = { fechaDesde: '', fechaHasta: '', abogadoIds: [], bancoIds: [], procuradorIds: [] }
    setDraftFilters(empty)
    startTransition(() => router.replace(pathname))
  }

  const activeFilterCount =
    (appliedFilters.fechaDesde ? 1 : 0) +
    (appliedFilters.fechaHasta ? 1 : 0) +
    appliedFilters.abogadoIds.length +
    appliedFilters.bancoIds.length +
    appliedFilters.procuradorIds.length

  const selectSection = (section: DashboardSection) => {
    setActiveSection(section)
    fetchDashboard(true, section)
  }

  const cards = data ? [
    { key: 'pending' as const, label: 'Pendientes', value: data.metrics.pending, detail: 'notificaciones activas', icon: CalendarClock, tone: 'blue' },
    { key: 'overdue' as const, label: 'Atrasadas', value: data.metrics.overdue, detail: 'mas de 14 dias', icon: AlertTriangle, tone: 'rose' },
    { key: 'unpaid' as const, label: 'Recibos sin pagar', value: data.metrics.unpaid, detail: formatCurrency(data.metrics.unpaidAmount), icon: Banknote, tone: 'amber' },
    { key: 'missingEstampos' as const, label: 'Faltan estampos', value: data.metrics.missingEstampos, detail: 'con recibo vigente', icon: Stamp, tone: 'sky' },
    { key: 'recentDocuments' as const, label: 'Documentos recientes', value: data.metrics.recentDocuments, detail: 'ultimos 7 dias', icon: FileText, tone: 'emerald' },
  ] : []

  const toneClasses: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    sky: 'border-sky-200 bg-sky-50 text-sky-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }

  const activeRows = data?.rows[activeSection] ?? []
  const activeTotal = data?.metrics[activeSection === 'missingEstampos' ? 'missingEstampos' : activeSection === 'recentDocuments' ? 'recentDocuments' : activeSection] ?? 0

  return (
    <div className="app-shell">
      <main className="page-frame page-stack">
        <section className="relative overflow-hidden rounded-[30px] bg-slate-950 px-6 py-7 text-white shadow-[0_32px_90px_-42px_rgba(15,23,42,0.9)] sm:px-8">
          <div className="absolute inset-0 opacity-30 soft-grid" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Cockpit operativo</div>
              <h1 className="hero-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Jornada de la oficina</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Trabajo pendiente, atrasos, cobros y documentos vigentes en una sola vista.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                {data ? `Actualizado ${formatDate(data.generatedAt, true)}` : 'Preparando informacion...'}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => fetchDashboard(true)}
                disabled={refreshing || !online}
                className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
          </div>
        </section>

        {!online && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <WifiOff className="h-4 w-4" />
            Sin conexion. Se conserva la ultima informacion cargada y la actualizacion se reanudara al volver en linea.
          </div>
        )}

        <DashboardSearch />

        <QuickActionsPanel filters={appliedFilters} />

        <section className="app-section mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="page-kicker">Filtros compartidos</div>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Enfocar la operacion</h2>
            </div>
            {activeFilterCount > 0 && (
              <span className="status-pill border-blue-200 bg-blue-50 text-blue-700">{activeFilterCount} filtros activos</span>
            )}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <label>
              <span className="field-label">Fecha desde</span>
              <Input type="date" value={draftFilters.fechaDesde} onChange={event => setDraftFilters(current => ({ ...current, fechaDesde: event.target.value }))} />
            </label>
            <label>
              <span className="field-label">Fecha hasta</span>
              <Input type="date" value={draftFilters.fechaHasta} onChange={event => setDraftFilters(current => ({ ...current, fechaHasta: event.target.value }))} />
            </label>
            <MultiSelect label="Abogado" options={data?.options.abogados ?? []} selectedIds={draftFilters.abogadoIds} onChange={ids => setDraftFilters(current => ({ ...current, abogadoIds: ids }))} />
            <MultiSelect label="Banco" options={data?.options.bancos ?? []} selectedIds={draftFilters.bancoIds} onChange={ids => setDraftFilters(current => ({ ...current, bancoIds: ids }))} />
            <MultiSelect label="Procurador" options={data?.options.procuradores ?? []} selectedIds={draftFilters.procuradorIds} onChange={ids => setDraftFilters(current => ({ ...current, procuradorIds: ids }))} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={applyFilters}><Search className="mr-2 h-4 w-4" />Aplicar filtros</Button>
            <Button variant="outline" onClick={clearFilters} disabled={activeFilterCount === 0 && Object.values(draftFilters).every(value => Array.isArray(value) ? value.length === 0 : !value)}>
              <X className="mr-2 h-4 w-4" />Limpiar
            </Button>
          </div>
        </section>

        {error && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            <span>{error}</span>
            <button type="button" onClick={() => fetchDashboard(false)} className="font-semibold underline underline-offset-4">Reintentar</button>
          </div>
        )}

        {loading && !data ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-[26px] bg-white/75 shadow-sm" />)}
          </div>
        ) : data ? (
          <>
            <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {cards.map(card => {
                const Icon = card.icon
                const selected = activeSection === card.key
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => selectSection(card.key)}
                    aria-pressed={selected}
                    className={`interactive-card rounded-[26px] border p-5 text-left shadow-sm ${selected ? `${toneClasses[card.tone]} ring-2 ring-slate-900/10` : 'border-white/80 bg-white/90 text-slate-900'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className={`rounded-2xl border p-3 ${toneClasses[card.tone]}`}><Icon className="h-5 w-5" /></div>
                      {selected && <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <div className="mt-6 text-3xl font-semibold tracking-tight">{card.value}</div>
                    <div className="mt-2 text-sm font-semibold">{card.label}</div>
                    <div className="mt-1 text-xs opacity-70">{card.detail}</div>
                  </button>
                )
              })}
            </section>

            <section className="app-section mt-6 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 px-5 py-5 sm:px-6">
                <div>
                  <div className="page-kicker">Cola seleccionada</div>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">{sectionMeta[activeSection].title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{sectionMeta[activeSection].subtitle}</p>
                </div>
                <span className="status-pill border-slate-200 bg-slate-50 text-slate-700">{activeTotal} resultados</span>
              </div>
              {activeRows.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                  <p className="mt-4 text-sm font-medium text-slate-600">{sectionMeta[activeSection].empty}</p>
                </div>
              ) : activeSection === 'unpaid' ? (
                <ReceiptTable rows={activeRows as DashboardReceiptRow[]} />
              ) : activeSection === 'recentDocuments' ? (
                <DocumentsTable rows={activeRows as DashboardDocumentRow[]} />
              ) : (
                <NotificationTable rows={activeRows as DashboardNotificationRow[]} overdue={activeSection === 'overdue'} />
              )}
            </section>
            <ActivityFeed />
          </>
        ) : null}
      </main>
    </div>
  )
}
