'use client'

import { Archive, ArrowDown, ArrowUp, FilePlus2, Play, Save, Settings2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyBlock, ErrorBlock, formatDateTime, LoadingBlock, StatusBadge } from './reportes-ui'
import type { CustomDefinitionRow, RecipientConfiguration } from './reportes-types'

const MODULES = ['auth', 'search', 'roles', 'diligencias', 'notificaciones', 'documents', 'recibos', 'payments', 'emails', 'audit', 'settings', 'security', 'reports', 'system']
const CATEGORIES = ['CREATE', 'UPDATE', 'DELETE', 'READ', 'OTHER']
const RESULTS = ['success', 'failure', 'denied']
const COLUMNS = [
  ['timestamp', 'Fecha y hora Chile'], ['actor', 'Administrador / sistema'], ['module', 'Módulo'], ['category', 'Categoría'],
  ['eventType', 'Tipo de evento'], ['result', 'Resultado'], ['recordType', 'Tipo de registro'], ['recordId', 'Identificador'],
  ['rol', 'ROL'], ['shortName', 'Nombre corto'], ['description', 'Descripción'], ['detail', 'Detalle seguro'],
] as const
type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY'
type FormState = {
  name: string; description: string; modules: string[]; actionCategories: string[]; results: string[]; includeSystem: boolean
  actorUserIds: string[]; selectedColumns: string[]; recipientUserIds: string[]; scheduleEnabled: boolean; frequency: Frequency; localTime: string
  weekday: number; monthDay: number; latenessThresholdMinutes: number
}
const emptyForm: FormState = {
  name: '', description: '', modules: [], actionCategories: CATEGORIES, results: RESULTS, includeSystem: true, actorUserIds: [],
  selectedColumns: COLUMNS.map(([value]) => value), recipientUserIds: [], scheduleEnabled: false, frequency: 'DAILY',
  localTime: '07:30', weekday: 1, monthDay: 1, latenessThresholdMinutes: 60,
}

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...init })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? 'No se pudo completar la operación.')
  return payload.data as T
}
function date(offset = 0) { const value = new Date(); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10) }

export default function CustomReportsSection({ onMessage }: { onMessage: (value: string, error?: boolean) => void }) {
  const [rows, setRows] = useState<CustomDefinitionRow[]>([])
  const [recipients, setRecipients] = useState<RecipientConfiguration | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState<string | null>(null)
  const [runRange, setRunRange] = useState({ from: date(-7), to: date(-1), deliver: false })
  const load = () => {
    setLoading(true); setError(null)
    Promise.all([request<CustomDefinitionRow[]>('/api/reports/custom-definitions'), request<RecipientConfiguration>('/api/reports/recipients')])
      .then(([definitions, configuration]) => { setRows(definitions); setRecipients(configuration) })
      .catch(value => setError(value.message)).finally(() => setLoading(false))
  }
  useEffect(load, [])
  const customRecipients = useMemo(() => recipients?.recipients.filter(item => item.active && item.customEnabled) ?? [], [recipients])
  const toggle = (field: 'modules' | 'actionCategories' | 'results' | 'actorUserIds' | 'recipientUserIds', value: string) => setForm(current => ({
    ...current, [field]: current[field].includes(value) ? current[field].filter(item => item !== value) : [...current[field], value],
  }))
  const startEdit = (row?: CustomDefinitionRow) => {
    if (!row) {
      setForm({ ...emptyForm, actionCategories: [...CATEGORIES], results: [...RESULTS], selectedColumns: COLUMNS.map(([value]) => value), recipientUserIds: customRecipients.map(item => item.userId) })
      setEditing('new'); return
    }
    setForm({ name: row.name, description: row.description ?? '', modules: row.modules ?? [], actionCategories: row.actionCategories ?? CATEGORIES,
      results: row.results ?? RESULTS, includeSystem: row.includeSystem, selectedColumns: row.selectedColumns ?? COLUMNS.map(([value]) => value),
      actorUserIds: row.actorUserIds ?? [],
      recipientUserIds: row.recipients.map(item => item.userId), scheduleEnabled: !!row.schedule, frequency: row.schedule?.frequency ?? 'DAILY',
      localTime: row.schedule?.localTime ?? '07:30', weekday: row.schedule?.weekday ?? 1, monthDay: row.schedule?.monthDay ?? 1,
      latenessThresholdMinutes: row.schedule?.latenessThresholdMinutes ?? 60 })
    setEditing(row.id)
  }
  const moveColumn = (index: number, delta: number) => setForm(current => {
    const selectedColumns = [...current.selectedColumns]; const next = index + delta
    if (next < 0 || next >= selectedColumns.length) return current
    ;[selectedColumns[index], selectedColumns[next]] = [selectedColumns[next], selectedColumns[index]]
    return { ...current, selectedColumns }
  })
  const save = async () => {
    setBusy('save')
    try {
      const schedule = form.scheduleEnabled ? { frequency: form.frequency, localTime: form.localTime,
        weekday: form.frequency === 'WEEKLY' ? form.weekday : null, monthDay: form.frequency === 'MONTHLY' ? form.monthDay : null,
        latenessThresholdMinutes: form.latenessThresholdMinutes } : null
      const body = { name: form.name, description: form.description || null, modules: form.modules, actionCategories: form.actionCategories,
        results: form.results, actorUserIds: form.actorUserIds, includeSystem: form.includeSystem, selectedColumns: form.selectedColumns,
        recipientUserIds: form.recipientUserIds, schedule }
      await request(editing === 'new' ? '/api/reports/custom-definitions' : `/api/reports/custom-definitions/${editing}`, {
        method: editing === 'new' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      onMessage(editing === 'new' ? 'Definición personalizada creada.' : 'Definición personalizada actualizada.')
      setEditing(null); load()
    } catch (value) { onMessage(value instanceof Error ? value.message : 'No se pudo guardar.', true) } finally { setBusy(null) }
  }
  const run = async (row: CustomDefinitionRow) => {
    setBusy(`run:${row.id}`)
    try {
      await request(`/api/reports/custom-definitions/${row.id}/run`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `report-custom-run-${crypto.randomUUID()}` },
        body: JSON.stringify({ dateFrom: runRange.from, dateTo: runRange.to, deliver: runRange.deliver }) })
      onMessage('El reporte personalizado quedó en cola. Puedes seguirlo en Trabajos.')
    } catch (value) { onMessage(value instanceof Error ? value.message : 'No se pudo ejecutar.', true) } finally { setBusy(null) }
  }
  const archive = async (row: CustomDefinitionRow) => {
    if (!window.confirm(`Se archivará “${row.name}”. Sus archivos históricos seguirán disponibles. ¿Continuar?`)) return
    setBusy(`archive:${row.id}`)
    try { await request(`/api/reports/custom-definitions/${row.id}/archive`, { method: 'POST' }); onMessage('Definición archivada.'); load() }
    catch (value) { onMessage(value instanceof Error ? value.message : 'No se pudo archivar.', true) } finally { setBusy(null) }
  }

  return <section id="operations-panel-custom" role="tabpanel" aria-labelledby="operations-view-custom" className="space-y-5">
    <header className="app-section p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="page-kicker">ActivityEvent · XLSX seguro</div><h2 className="mt-2 text-2xl font-semibold text-slate-950">Reportes personalizados</h2><p className="mt-1 text-sm text-slate-600">Definiciones reutilizables con campos aprobados, filtros curados y hasta 50.000 filas.</p></div><Button onClick={() => startEdit()}><FilePlus2 className="mr-2 h-4 w-4" />Nueva definición</Button></div></header>
    {editing && <section aria-label="Editor de definición" className="app-section overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-5"><div><div className="page-kicker">{editing === 'new' ? 'Crear' : 'Editar'}</div><h3 className="mt-1 text-xl font-semibold">Definición segura</h3></div><button type="button" onClick={() => setEditing(null)} aria-label="Cerrar editor" className="rounded-xl border border-slate-200 p-2"><X className="h-4 w-4" /></button></header>
      <div className="grid gap-6 p-5 xl:grid-cols-2"><div className="space-y-4">
        <label className="block text-sm font-semibold text-slate-700">Nombre<Input className="mt-1" value={form.name} maxLength={120} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
        <label className="block text-sm font-semibold text-slate-700">Descripción opcional<textarea className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 p-3 text-sm" value={form.description} maxLength={500} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label>
        <fieldset><legend className="text-sm font-semibold text-slate-700">Módulos</legend><div className="mt-2 flex flex-wrap gap-2">{MODULES.map(value => <label key={value} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${form.modules.includes(value) ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200'}`}><input className="sr-only" type="checkbox" checked={form.modules.includes(value)} onChange={() => toggle('modules', value)} />{value}</label>)}</div></fieldset>
        <div className="grid gap-4 sm:grid-cols-2"><fieldset><legend className="text-sm font-semibold text-slate-700">Categorías</legend>{CATEGORIES.map(value => <label key={value} className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.actionCategories.includes(value)} onChange={() => toggle('actionCategories', value)} />{value}</label>)}</fieldset><fieldset><legend className="text-sm font-semibold text-slate-700">Resultados</legend>{RESULTS.map(value => <label key={value} className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.results.includes(value)} onChange={() => toggle('results', value)} />{value}</label>)}<label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.includeSystem} onChange={event => setForm(current => ({ ...current, includeSystem: event.target.checked }))} />Incluir sistema</label></fieldset></div>
        <fieldset><legend className="text-sm font-semibold text-slate-700">Actores de la oficina (opcional)</legend><p className="mt-1 text-xs text-slate-500">Sin selección se incluyen todos los actores autorizados por los demás filtros.</p><div className="mt-2 space-y-2">{recipients?.recipients.map(row => <label key={row.userId} className="flex items-center gap-2 break-all text-sm"><input type="checkbox" checked={form.actorUserIds.includes(row.userId)} onChange={() => toggle('actorUserIds', row.userId)} />{row.email}</label>)}</div></fieldset>
      </div><div className="space-y-5">
        <fieldset><legend className="text-sm font-semibold text-slate-700">Columnas aprobadas y orden</legend><div className="mt-2 space-y-2">{form.selectedColumns.map((column, index) => <div key={column} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm"><span>{COLUMNS.find(item => item[0] === column)?.[1] ?? column}</span><span className="flex gap-1"><button type="button" aria-label={`Subir ${column}`} onClick={() => moveColumn(index, -1)} className="rounded-lg border p-1"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Bajar ${column}`} onClick={() => moveColumn(index, 1)} className="rounded-lg border p-1"><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Quitar ${column}`} onClick={() => setForm(current => ({ ...current, selectedColumns: current.selectedColumns.filter(value => value !== column) }))} className="rounded-lg border p-1"><X className="h-3.5 w-3.5" /></button></span></div>)}</div><select aria-label="Agregar columna" className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value="" onChange={event => event.target.value && setForm(current => ({ ...current, selectedColumns: [...current.selectedColumns, event.target.value] }))}><option value="">Agregar columna…</option>{COLUMNS.filter(([value]) => !form.selectedColumns.includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></fieldset>
        <fieldset><legend className="text-sm font-semibold text-slate-700">Destinatarios personalizados</legend><div className="mt-2 space-y-2">{customRecipients.length ? customRecipients.map(row => <label key={row.userId} className="flex items-center gap-2 break-all text-sm"><input type="checkbox" checked={form.recipientUserIds.includes(row.userId)} onChange={() => toggle('recipientUserIds', row.userId)} />{row.email}</label>) : <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Habilita destinatarios personalizados en la matriz.</p>}</div></fieldset>
        <fieldset className="rounded-2xl border border-slate-200 p-4"><legend className="px-2 text-sm font-semibold">Programación opcional</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.scheduleEnabled} onChange={event => setForm(current => ({ ...current, scheduleEnabled: event.target.checked }))} />Crear o actualizar programación</label>{form.scheduleEnabled && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Frecuencia<select className="mt-1 h-10 w-full rounded-xl border px-3" value={form.frequency} onChange={event => setForm(current => ({ ...current, frequency: event.target.value as Frequency }))}><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option></select></label><label className="text-xs font-semibold">Hora<Input className="mt-1" type="time" value={form.localTime} onChange={event => setForm(current => ({ ...current, localTime: event.target.value }))} /></label>{form.frequency === 'WEEKLY' && <label className="text-xs font-semibold">Día de la semana<select className="mt-1 h-10 w-full rounded-xl border px-3" value={form.weekday} onChange={event => setForm(current => ({ ...current, weekday: Number(event.target.value) }))}><option value={1}>Lunes</option><option value={2}>Martes</option><option value={3}>Miércoles</option><option value={4}>Jueves</option><option value={5}>Viernes</option><option value={6}>Sábado</option><option value={7}>Domingo</option></select></label>}{form.frequency === 'MONTHLY' && <label className="text-xs font-semibold">Día del mes (1–28)<Input className="mt-1" type="number" min={1} max={28} value={form.monthDay} onChange={event => setForm(current => ({ ...current, monthDay: Number(event.target.value) }))} /></label>}<label className="text-xs font-semibold">Umbral de atraso (minutos)<Input className="mt-1" type="number" min={1} max={1440} value={form.latenessThresholdMinutes} onChange={event => setForm(current => ({ ...current, latenessThresholdMinutes: Number(event.target.value) }))} /></label></div>}</fieldset>
      </div></div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4"><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save} disabled={busy === 'save' || !form.name || !form.actionCategories.length || !form.results.length || !form.selectedColumns.length}><Save className="mr-2 h-4 w-4" />Guardar definición</Button></footer>
    </section>}
    <section className="app-section overflow-hidden"><div className="border-b border-slate-200 bg-slate-50 p-5"><div className="grid gap-3 sm:grid-cols-4"><label className="text-xs font-semibold">Desde<Input className="mt-1" type="date" value={runRange.from} onChange={event => setRunRange(current => ({ ...current, from: event.target.value }))} /></label><label className="text-xs font-semibold">Hasta<Input className="mt-1" type="date" value={runRange.to} onChange={event => setRunRange(current => ({ ...current, to: event.target.value }))} /></label><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><input type="checkbox" checked={runRange.deliver} onChange={event => setRunRange(current => ({ ...current, deliver: event.target.checked }))} />Entregar al completar</label><p className="self-center text-xs leading-5 text-slate-500">Máximo 366 días y 50.000 filas.</p></div></div>
      <div className="p-4 sm:p-6">{error ? <ErrorBlock message={error} onRetry={load} /> : loading ? <LoadingBlock label="Cargando definiciones…" /> : !rows.length ? <EmptyBlock icon={<Settings2 className="h-6 w-6" />} title="No hay definiciones" copy="Crea una plantilla segura para consultar el ledger de actividad." /> : <div className="grid gap-4 xl:grid-cols-2">{rows.map(row => <article key={row.id} className={`rounded-[26px] border p-5 shadow-sm ${row.status === 'ARCHIVED' ? 'border-slate-200 bg-slate-50 opacity-75' : 'border-slate-200 bg-white'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{row._count.reports} reportes · {row._count.jobs} trabajos</p><h3 className="mt-1 text-lg font-semibold text-slate-950">{row.name}</h3></div><StatusBadge value={row.status} /></div>{row.description && <p className="mt-3 text-sm leading-6 text-slate-600">{row.description}</p>}<dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">Columnas</dt><dd className="mt-1 font-semibold">{row.selectedColumns.length}</dd></div><div><dt className="text-slate-500">Destinatarios</dt><dd className="mt-1 font-semibold">{row.recipients.length}</dd></div><div><dt className="text-slate-500">Programación</dt><dd className="mt-1 font-semibold">{row.schedule ? `${row.schedule.frequency} · ${row.schedule.enabled ? 'activa' : 'desactivada'}` : 'Manual'}</dd></div><div><dt className="text-slate-500">Actualizada</dt><dd className="mt-1 font-semibold">{formatDateTime(row.updatedAt)}</dd></div></dl><div className="mt-5 flex flex-wrap gap-2">{row.status === 'ACTIVE' && <><Button size="sm" onClick={() => run(row)} disabled={!!busy || !runRange.from || !runRange.to}><Play className="mr-2 h-4 w-4" />{runRange.deliver ? 'Generar y entregar' : 'Ejecutar'}</Button><Button size="sm" variant="outline" onClick={() => startEdit(row)} disabled={!!busy}><Settings2 className="mr-2 h-4 w-4" />Editar</Button><Button size="sm" variant="outline" onClick={() => archive(row)} disabled={!!busy}><Archive className="mr-2 h-4 w-4" />Archivar</Button></>}</div></article>)}</div>}</div>
    </section>
  </section>
}
