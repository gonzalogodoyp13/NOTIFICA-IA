'use client'

import { AlertTriangle, CalendarClock, ListTodo, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { formatDateTime, StatusBadge } from './reportes-ui'
import type { JobEnvelope, RecipientConfiguration, ReportScheduleRow } from './reportes-types'

async function getData<T>(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: 'no-store', credentials: 'include', signal })
  const payload = await response.json()
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? 'No se pudo cargar el estado operativo.')
  return payload.data as T
}

export default function ControlHealthStrip() {
  const [jobs, setJobs] = useState<JobEnvelope | null>(null)
  const [schedules, setSchedules] = useState<ReportScheduleRow[]>([])
  const [recipients, setRecipients] = useState<RecipientConfiguration | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getData<JobEnvelope>('/api/reports/jobs?limit=5', controller.signal),
      getData<ReportScheduleRow[]>('/api/reports/schedules', controller.signal),
      getData<RecipientConfiguration>('/api/reports/recipients', controller.signal),
    ]).then(([jobData, scheduleData, recipientData]) => { setJobs(jobData); setSchedules(scheduleData); setRecipients(recipientData); setError(null) }).catch(value => { if (value.name !== 'AbortError') setError(value.message) })
    return () => controller.abort()
  }, [])
  const activeJobs = (jobs?.summary.QUEUED ?? 0) + (jobs?.summary.RUNNING ?? 0) + (jobs?.summary.CANCEL_REQUESTED ?? 0)
  const unhealthy = schedules.filter(schedule => ['ATTENTION', 'CRITICAL'].includes(schedule.health.state)).length
  const daily = recipients?.recipients.filter(item => item.active && item.dailyEnabled).length ?? 0
  const monthly = recipients?.recipients.filter(item => item.active && item.monthlyEnabled).length ?? 0
  const custom = recipients?.recipients.filter(item => item.active && item.customEnabled).length ?? 0
  const next = schedules.filter(schedule => schedule.enabled && schedule.nextRunAt).sort((a, b) => String(a.nextRunAt).localeCompare(String(b.nextRunAt)))[0]
  return <section aria-label="Estado de automatización" className="mb-6 rounded-[28px] border border-slate-800 bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/15 sm:p-6">
    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between"><div><div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Pulso operativo</div><h2 className="mt-2 text-xl font-semibold">Automatización y preparación</h2><p className="mt-1 text-sm text-slate-300">La generación y entrega se procesan como trabajos durables con seguimiento visible.</p></div>
      <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[590px]">
        <article className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-2 text-xs text-slate-300"><ListTodo className="h-4 w-4 text-cyan-300" />Trabajos activos</div><p className="mt-2 text-2xl font-semibold">{activeJobs}</p></article>
        <article className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-2 text-xs text-slate-300"><CalendarClock className="h-4 w-4 text-cyan-300" />Programaciones en alerta</div><p className="mt-2 text-2xl font-semibold">{unhealthy}</p></article>
        <article className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-2 text-xs text-slate-300"><UsersRound className="h-4 w-4 text-cyan-300" />Elegibles D / M / P</div><p className="mt-2 text-2xl font-semibold">{daily} / {monthly} / {custom}</p></article>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"><AlertTriangle className="h-4 w-4" />{error}</p>}
    {!error && <div className="mt-5 grid gap-3 border-t border-white/10 pt-4 lg:grid-cols-[1fr_1.4fr]"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Próxima ejecución</p><p className="mt-2 text-sm">{next ? <>{next.customDefinition?.name ?? (next.kind === 'DAILY' ? 'Reporte diario' : 'Reporte mensual')} · {formatDateTime(next.nextRunAt)}</> : 'No hay programaciones habilitadas.'}</p></div><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Trabajos recientes</p><div className="mt-2 flex flex-wrap gap-2">{jobs?.items.length ? jobs.items.slice(0, 4).map(job => <span key={job.id} className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs text-slate-800"><StatusBadge value={job.status} />{job.requestedPeriodLabel}</span>) : <span className="text-sm text-slate-300">Sin trabajos registrados.</span>}</div></div></div>}
  </section>
}
