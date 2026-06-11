'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, History } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ActivityType, DashboardActivityEvent } from '@/lib/dashboard/types'

export default function ActivityFeed() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ActivityType>('all')
  const [events, setEvents] = useState<DashboardActivityEvent[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (nextCursor?: string, append = false, nextType = type) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ type: nextType, limit: '50' })
      if (nextCursor) params.set('cursor', nextCursor)
      const response = await fetch(`/api/dashboard/activity?${params}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'No se pudo cargar la actividad.')
      setEvents(current => append ? [...current, ...payload.data.events] : payload.data.events)
      setCursor(payload.data.nextCursor)
      setLoaded(true)
    } catch (fetchError) { setError(fetchError instanceof Error ? fetchError.message : 'No se pudo cargar la actividad.') }
    finally { setLoading(false) }
  }

  const toggle = () => { const next = !open; setOpen(next); if (next && !loaded) load() }
  const changeType = (next: ActivityType) => { setType(next); setEvents([]); setCursor(null); setLoaded(false); load(undefined, false, next) }

  return (
    <section className="app-section mt-6 overflow-hidden">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6">
        <div className="flex items-center gap-3"><span className="rounded-2xl bg-slate-100 p-3 text-slate-700"><History className="h-5 w-5" /></span><div><div className="page-kicker">Trazabilidad operativa</div><h2 className="mt-1 text-xl font-semibold text-slate-950">Actividad reciente</h2></div></div>
        {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>
      {open && <div className="border-t border-slate-200">
        <div className="px-5 py-4 sm:px-6"><select value={type} onChange={event => changeType(event.target.value as ActivityType)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">Toda la actividad</option><option value="cases">ROL y estados</option><option value="diligencias">Diligencias</option><option value="notifications">Notificaciones</option><option value="documents">Recibos y estampos</option><option value="payments">Pagos y boletas</option><option value="notes">Notas</option><option value="exports">Exportaciones</option></select></div>
        {error && <div className="px-6 py-4 text-sm text-rose-700">{error}</div>}
        <div className="divide-y divide-slate-100">{events.map(event => <Link key={event.id} href={event.href} className="block px-5 py-4 hover:bg-slate-50 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-slate-900">{event.title}</div>{event.detail && <div className="mt-1 text-sm text-slate-500">{event.detail}</div>}</div><time className="text-xs text-slate-500">{new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.occurredAt))}</time></div></Link>)}</div>
        {loading && <div className="px-6 py-5 text-sm text-slate-500">Cargando actividad...</div>}
        {!loading && loaded && events.length === 0 && <div className="px-6 py-10 text-center text-sm text-slate-500">No hay actividad para este periodo.</div>}
        {cursor && <div className="border-t border-slate-100 px-6 py-4"><Button variant="outline" onClick={() => load(cursor, true)} disabled={loading}>Cargar mas</Button></div>}
      </div>}
    </section>
  )
}
