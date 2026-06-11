'use client'

import { FormEvent, KeyboardEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Clock3, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { readRecentRoles } from '@/lib/client/recentRoles'
import type { RecentRole, RoleSearchPayload } from '@/lib/dashboard/types'

export default function DashboardSearch() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<RoleSearchPayload | null>(null)
  const [recent, setRecent] = useState<RecentRole[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState(0)

  useEffect(() => setRecent(readRecentRoles()), [])

  useEffect(() => {
    if (!submitted) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/search/roles?q=${encodeURIComponent(submitted)}&page=${page}&pageSize=50`, { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'No se pudo buscar.')
        if (!cancelled) { setData(payload.data); setHighlighted(0) }
      })
      .catch(fetchError => !cancelled && setError(fetchError.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [page, submitted])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = query.trim()
    if (!value) return
    setPage(1)
    setSubmitted(value)
  }

  const handleKeys = (event: KeyboardEvent) => {
    if (!data?.results.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlighted(value => Math.min(value + 1, data.results.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setHighlighted(value => Math.max(value - 1, 0)) }
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      if (data.results[highlighted] && query.trim() === submitted && !loading) {
        event.preventDefault()
        window.location.assign(`/roles/${data.results[highlighted].id}`)
      }
      return
    }
    if (event.key === 'Enter' && data.results[highlighted]) window.location.assign(`/roles/${data.results[highlighted].id}`)
    if (event.key === 'Escape') { setData(null); setSubmitted(''); setQuery('') }
  }

  return (
    <section className="app-section mt-6 overflow-hidden" onKeyDown={handleKeys}>
      <div className="border-b border-slate-200/80 px-5 py-5 sm:px-6">
        <div className="page-kicker">Busqueda unificada</div>
        <form onSubmit={submit} className="mt-3 flex gap-3">
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="ROL, ejecutado, abogado o banco" aria-label="Buscar ROL" />
          <Button type="submit" disabled={loading || !query.trim()}><Search className="mr-2 h-4 w-4" />Buscar</Button>
        </form>
      </div>
      {error && <div className="px-6 py-4 text-sm text-rose-700">{error}</div>}
      {loading && <div className="px-6 py-8 text-sm text-slate-500">Buscando coincidencias...</div>}
      {!loading && data && (
        <div>
          <div className="px-6 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{data.total} resultados</div>
          <div className="divide-y divide-slate-100">
            {data.results.map((role, index) => (
              <Link key={role.id} href={`/roles/${role.id}`} className={`block px-6 py-4 transition ${index === highlighted ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-slate-950">{role.rol}</strong><span className="text-xs text-slate-500">{role.matchReasons.join(' | ')}</span></div>
                <div className="mt-1 text-sm text-slate-600">{role.tribunal} | {role.caratula}</div>
                <div className="mt-1 text-xs text-slate-500">{role.abogado} | {role.ejecutados.join(', ') || 'Sin ejecutado'}</div>
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Anterior</Button>
            <span className="text-sm text-slate-500">Pagina {page} de {data.totalPages}</span>
            <Button variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(value => value + 1)}>Siguiente<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </div>
      )}
      {!loading && !data && recent.length > 0 && (
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"><Clock3 className="h-4 w-4" />ROL recientes</div>
          <div className="mt-3 flex flex-wrap gap-2">{recent.map(role => <Link key={role.id} href={`/roles/${role.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">{role.rol}</Link>)}</div>
        </div>
      )}
    </section>
  )
}
