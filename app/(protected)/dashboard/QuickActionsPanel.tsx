'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, FilePlus2, Play, ReceiptText, Stamp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { QuickActionKind, QuickActionPayload, QuickActionSort } from '@/lib/dashboard/types'

type CockpitFilters = {
  fechaDesde?: string
  fechaHasta?: string
  abogadoIds: Array<string | number>
  bancoIds: Array<string | number>
  procuradorIds: Array<string | number>
}

const actions = [
  { kind: 'continue' as const, label: 'Continuar flujo', icon: Play },
  { kind: 'missingRecibo' as const, label: 'Generar recibo faltante', icon: ReceiptText },
  { kind: 'missingEstampo' as const, label: 'Generar estampo faltante', icon: Stamp },
]

function filterParams(filters: CockpitFilters) {
  const params = new URLSearchParams()
  if (filters.fechaDesde) params.set('fechaDesde', filters.fechaDesde)
  if (filters.fechaHasta) params.set('fechaHasta', filters.fechaHasta)
  filters.abogadoIds.forEach(id => params.append('abogadoId', String(id)))
  filters.bancoIds.forEach(id => params.append('bancoId', String(id)))
  filters.procuradorIds.forEach(id => params.append('procuradorId', String(id)))
  return params
}

export default function QuickActionsPanel({ filters }: { filters: CockpitFilters }) {
  const [kind, setKind] = useState<QuickActionKind | null>(null)
  const [sort, setSort] = useState<QuickActionSort>('recent')
  const [data, setData] = useState<QuickActionPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const filterKey = useMemo(() => JSON.stringify(filters), [filters])

  const load = async (nextOffset = 0, append = false) => {
    if (!kind) return
    setLoading(true)
    setError(null)
    try {
      const params = filterParams(filters)
      params.set('kind', kind)
      params.set('sort', sort)
      params.set('offset', String(nextOffset))
      params.set('limit', '10')
      const response = await fetch(`/api/dashboard/actions?${params}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'No se pudo cargar la cola.')
      setData(current => append && current ? { ...payload.data, rows: [...current.rows, ...payload.data.rows] } : payload.data)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudo cargar la cola.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (kind) load(0, false) }, [kind, sort, filterKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="app-section mt-6 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
        <div><div className="page-kicker">Acciones rapidas</div><h2 className="mt-2 text-xl font-semibold text-slate-950">Retomar trabajo sin perder contexto</h2></div>
        <Link href="/recibos?action=associateBoleta" className="inline-flex min-h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"><FilePlus2 className="mr-2 h-4 w-4" />Asociar boleta</Link>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        {actions.map(action => { const Icon = action.icon; return <button key={action.kind} type="button" onClick={() => setKind(action.kind)} className={`rounded-2xl border px-4 py-4 text-left transition ${kind === action.kind ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'}`}><Icon className="h-5 w-5" /><div className="mt-3 font-semibold">{action.label}</div><div className="mt-1 text-xs opacity-70">Abrir cola</div></button> })}
      </div>
      {kind && (
        <div className="border-t border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
            <span className="text-sm font-semibold text-slate-700">{data?.total ?? 0} pendientes</span>
            <select value={sort} onChange={event => setSort(event.target.value as QuickActionSort)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="recent">Actividad mas reciente</option><option value="oldest">Actividad mas antigua</option><option value="overdue">Mas atrasada</option></select>
          </div>
          {error && <div className="px-6 py-4 text-sm text-rose-700">{error}</div>}
          <div className="divide-y divide-slate-100">
            {data?.rows.map(row => (
              <Link key={row.notificacionId} href={`/roles/${row.rolId}?tab=diligencias&diligenciaId=${row.diligenciaId}&notificacionId=${row.notificacionId}&step=${row.targetStep}`} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 sm:px-6">
                <div><div className="font-semibold text-slate-950">{row.rol} | {row.ejecutado}</div><div className="mt-1 text-sm text-slate-600">{row.diligenciaTipo} | paso {row.targetStep}</div>{row.blockers.length > 0 && <div className="mt-1 text-xs text-amber-700">Datos pendientes: {row.blockers.join(', ')}</div>}</div>
                <ArrowUpRight className="h-5 w-5 text-blue-700" />
              </Link>
            ))}
          </div>
          {!loading && data?.rows.length === 0 && <div className="px-6 py-9 text-center text-sm text-slate-500">No hay elementos en esta cola.</div>}
          {loading && <div className="px-6 py-5 text-sm text-slate-500">Cargando cola...</div>}
          {data?.nextOffset !== null && data?.nextOffset !== undefined && <div className="border-t border-slate-100 px-6 py-4"><Button variant="outline" disabled={loading} onClick={() => load(data.nextOffset!, true)}>Cargar mas</Button></div>}
        </div>
      )}
    </section>
  )
}
