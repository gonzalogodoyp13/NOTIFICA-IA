'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCheck, ChevronLeft, ChevronRight, CircleHelp, FileCheck2, Laptop, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateCL, formatDateTimeCL } from '@/lib/utils/dateInput'
import type { CenterActionInput, CenterData, CenterRow } from '@/lib/signing/centerContracts'
import SignedArchive from './SignedArchive'

const labels: Record<string, string> = {
  ELIGIBLE: 'Por solicitar', QUEUED: 'En cola', CLAIMED: 'Preparando firma remota', SIGNING: 'Firmando', RETRY_PENDING: 'Reintento programado',
  WAITING_FOR_OPERATOR: 'Requiere revisión', FAILED: 'No completado', EXPIRED: 'Asignación vencida', COMPLETED: 'Firmado y validado', CANCELLED: 'Cancelado', EXCLUDED: 'No elegible',
  OFFLINE: 'Sin conexión', AGENT_ONLINE_TOKEN_MISSING: 'Token desconectado', TOKEN_READY: 'Token disponible', CERT_EXPIRING: 'Certificado por vencer',
  CERT_EXPIRED: 'Certificado vencido', DRIVER_ERROR: 'Revisar controlador',
  RECEIVER_ONLINE: 'Receptor conectado',
}
function tone(status: string) {
  return ['COMPLETED', 'TOKEN_READY', 'RECEIVER_ONLINE'].includes(status) ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' :
    ['FAILED', 'WAITING_FOR_OPERATOR', 'EXPIRED', 'CERT_EXPIRED', 'DRIVER_ERROR', 'CERT_EXPIRING'].includes(status) ? 'bg-amber-50 text-amber-900 ring-amber-200' :
    ['QUEUED', 'CLAIMED', 'SIGNING', 'RETRY_PENDING'].includes(status) ? 'bg-blue-50 text-blue-800 ring-blue-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
}
function Badge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tone(status)}`}>{labels[status] ?? 'Revisar estado'}</span>
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init }).catch(error => {
    if (init?.signal?.aborted) throw error
    throw new Error('No se pudo conectar. Revisa tu conexión y vuelve a enviar la misma solicitud.')
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'No se pudo completar la solicitud.')
  return body.data
}
type Confirmation = { action: CenterActionInput; rows: CenterRow[] }
export default function FirmadosCenter() {
  const [data, setData] = useState<CenterData | null>(null)
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [status, setStatus] = useState('ALL'), [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Record<string, CenterRow>>({})
  const [fingerprint, setFingerprint] = useState(''), [profile, setProfile] = useState<'PADES_B' | 'PADES_LT' | 'PADES_LTA'>('PADES_LT')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null), [reviewed, setReviewed] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), request = useRef(0)
  const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), status, page: String(page) }).toString()
  const reload = useCallback(async (signal?: AbortSignal) => {
    const id = ++request.current
    try {
      const value = await api<CenterData>(`/api/signing/center?${query}`, { signal })
      if (id !== request.current) return
      setData(value); setError('')
    } catch (e) { if (!signal?.aborted && id === request.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el listado.') }
    finally { if (id === request.current) setLoading(false) }
  }, [query])
  useEffect(() => {
    // Preserve the reviewed snapshot and mutation error while the dialog is open.
    // Changing busy must not trigger a read that clears an uncertain result.
    if (confirmation || busy) return
    const controller = new AbortController(); setLoading(true); void reload(controller.signal)
    const interval = setInterval(() => { if (!document.hidden && !confirmation && !busy) void reload(controller.signal) }, 15000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [reload, confirmation, busy])
  useEffect(() => {
    if (confirmation) { setReviewed(false); dialog.current?.showModal() }
    else dialog.current?.close()
  }, [confirmation])
  function filter(update: () => void) { update(); setPage(1); setSelected({}); setNotice('') }
  const selectable = data?.rows.filter(r => r.status === 'ELIGIBLE' && r.versionId && r.checksum) ?? []
  const chosen = Object.values(selected)
  function toggle(row: CenterRow) {
    setSelected(old => { const next = { ...old }; if (next[row.id]) delete next[row.id]; else if (Object.keys(next).length < 500) next[row.id] = row; return next })
  }
  async function selectAll() {
    setBusy(true); setError('')
    try {
      const params = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), status: 'ELIGIBLE', pageSize: '500' })
      const result = await api<CenterData>(`/api/signing/center?${params}`)
      if (result.total > 500) throw new Error('Hay más de 500 estampos. Acota el rango de fechas para seleccionar todos.')
      setSelected(Object.fromEntries(result.rows.map(r => [r.id, r])))
      setNotice(`${result.rows.length} estampos seleccionados en todo el rango.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo seleccionar el rango.') }
    finally { setBusy(false) }
  }
  function reviewBatch() {
    if (!chosen.length || !fingerprint) return
    setConfirmation({ rows: chosen, action: { action: 'queue', signerFingerprint: fingerprint, requestedLevel: profile,
      sources: chosen.map(r => ({ versionId: r.versionId!, checksum: r.checksum! })) } })
  }
  async function execute() {
    if (!confirmation || !reviewed) return
    setBusy(true); setError('')
    try {
      const result = await api<{ replay?: boolean }>('/api/signing/center', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(confirmation.action) })
      setNotice(confirmation.action.action === 'retry-delivery' ? 'Entrega reactivada. Se copiará la misma firma validada.' : confirmation.action.action === 'queue' ? result.replay ? 'La solicitud ya estaba registrada. No se creó otra firma.' : 'Firma autorizada desde tu cuenta. Se procesará cuando la sesión del token esté habilitada.' : confirmation.action.action === 'retry' ? 'Reintento autorizado. Se procesará con la sesión del token habilitada.' : 'Solicitud cancelada antes de iniciar la firma.')
      setConfirmation(null); setSelected({}); await reload()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la acción. Puedes volver a enviar la misma confirmación.') }
    finally { setBusy(false) }
  }
  const signerOptions = data?.devices.filter(d => !d.revoked && d.role !== 'RECEIVER' && d.fingerprint && d.expiresAt && new Date(d.expiresAt) > new Date()) ?? []
  const countCards = [
    ['Por solicitar', data?.counts.eligible ?? 0, 'ELIGIBLE'], ['En proceso', data?.counts.active ?? 0, 'ACTIVE'],
    ['Requieren atención', data?.counts.attention ?? 0, 'ATTENTION'], ['Firmados', data?.counts.completed ?? 0, 'COMPLETED'],
  ] as const
  return <div className="app-shell px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1440px] space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-blue-800"><ShieldCheck size={16} /> Control documental</div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Firmados</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Solicita firmas, sigue su validación y recupera los estampos que necesitan atención.</p></div>
      <div className="flex items-center gap-3"><span className="hidden text-xs text-slate-500 sm:block">{data ? `Actualizado ${formatDateTimeCL(data.updatedAt)}` : 'Cargando centro de firmado'}</span>
        <Button variant="outline" onClick={() => void reload()} disabled={busy} aria-label="Actualizar centro de firmado"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /><span className="ml-2">Actualizar</span></Button></div>
    </header>
    {error && !confirmation && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCheck size={20} className="shrink-0" />{notice}</div>}
    {data && !data.canManage && <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">Puedes autorizar firmas desde tu cuenta. Un administrador de tu oficina gestiona recuperaciones, cancelaciones y equipos.</p>}
    <section aria-label="Resumen de la oficina" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{countCards.map(([label, count, key]) =>
      <button key={key} onClick={() => filter(() => setStatus(key))} className={`rounded-xl border bg-white p-4 text-left transition hover:border-blue-400 sm:p-5 ${status === key ? 'border-blue-700 ring-1 ring-blue-700' : 'border-slate-200'}`}>
        <span className="text-xs font-medium text-slate-500">{label}</span><strong className={`mt-2 block text-3xl font-semibold tabular-nums ${key === 'ATTENTION' && count ? 'text-amber-700' : 'text-slate-900'}`}>{count}</strong>
      </button>)}</section>
    {!!data?.alerts?.length && <section aria-label="Alertas operativas" className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <h2 className="text-sm font-semibold text-amber-950">Atención operativa · toda la oficina</h2>
      <ul className="mt-3 space-y-3">{data.alerts.map(a => <li key={a.id} className="text-sm text-amber-950">
        <strong>{a.count} {a.severity === 'critical' ? 'incidencia(s)' : 'aviso(s)'}</strong> · {a.message}
        {a.diagnosticCode && <code className="ml-2 break-all text-xs text-amber-800">{a.diagnosticCode}</code>}
      </li>)}</ul><p className="mt-3 text-xs text-amber-800">Estas alertas incluyen pendientes fuera del filtro de fechas.</p>
    </section>}
    <section className="rounded-xl border border-slate-200 bg-white" aria-label="Equipos y certificados">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Laptop size={17} /> Equipos de la oficina</h2><span className="text-xs text-slate-500">Carpeta compartida · últimos 50 días</span></div>
      {!data?.devices.length ? <p className="p-5 text-sm text-slate-500">{loading ? 'Consultando equipos…' : 'No hay equipos inscritos. Inscribe un equipo firmante para solicitar firmas.'}</p> :
        <div className="grid gap-px bg-slate-100 lg:grid-cols-2">{data.devices.map(d => <div key={d.id} className="min-w-0 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-words text-sm">{d.name}</strong><Badge status={d.role === 'RECEIVER' && d.health !== 'OFFLINE' ? 'RECEIVER_ONLINE' : d.health} /></div>
          <p className="mt-2 break-words text-xs text-slate-600">{d.revoked ? 'Equipo revocado' : d.role === 'RECEIVER' ? 'Receptor de documentos' : d.certificateSubject ?? 'Certificado aún no informado'}</p>
          <p className="mt-1 text-xs text-slate-500">{d.role !== 'RECEIVER' && <>Vencimiento: {formatDateCL(d.expiresAt)} · </>}Último contacto: {formatDateTimeCL(d.lastHeartbeatAt)}</p>
        </div>)}</div>}
      {data && !data.validatorConfigured && <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">La validación de firmas todavía no está habilitada. Las solicitudes permanecerán en cola hasta que el servicio esté disponible.</p>}
    </section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Estampos y solicitudes">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-5">
        <label className="min-w-0 flex-1 space-y-1.5 text-xs font-medium sm:flex-none"><span>Ejecución desde</span><Input type="date" value={from} onChange={e => filter(() => setFrom(e.target.value))} /></label>
        <label className="min-w-0 flex-1 space-y-1.5 text-xs font-medium sm:flex-none"><span>Ejecución hasta</span><Input type="date" value={to} onChange={e => filter(() => setTo(e.target.value))} /></label>
        <label className="w-full space-y-1.5 text-xs font-medium sm:w-52"><span>Estado</span><select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 pr-8 text-sm" value={status} onChange={e => filter(() => setStatus(e.target.value))}>
          <option value="ALL">Todos los estados</option><option value="ELIGIBLE">Por solicitar</option><option value="ACTIVE">En proceso</option><option value="ATTENTION">Requieren atención</option><option value="COMPLETED">Firmados</option><option value="CANCELLED">Cancelados</option></select></label>
        <button className="h-10 px-2 text-xs font-medium text-blue-800 hover:underline" onClick={() => filter(() => { setFrom(''); setTo(''); setStatus('ALL') })}>Limpiar filtros</button>
        <p className="basis-full text-xs text-slate-500">Fecha de ejecución de la diligencia · Calendario de Chile (America/Santiago). Los documentos sin fecha aparecen al quitar el rango.</p>
      </div>
      {data?.canRequest && <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <strong className="text-sm tabular-nums">{chosen.length} seleccionados</strong><button className="text-xs font-medium text-blue-800 underline underline-offset-4 disabled:opacity-40" onClick={() => void selectAll()} disabled={busy}>Seleccionar todos los elegibles del rango</button>
        {!!chosen.length && <button className="text-xs text-slate-500 underline" onClick={() => setSelected({})}>Quitar selección</button>}
        <div className="flex w-full flex-wrap gap-2 lg:ml-auto lg:w-auto"><label className="min-w-0 flex-1 lg:w-60"><span className="sr-only">Certificado firmante</span><select value={fingerprint} onChange={e => setFingerprint(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs">
          <option value="">Selecciona equipo / certificado</option>{signerOptions.map(d => <option key={d.id} value={d.fingerprint!}>{d.name} · {d.fingerprint?.slice(0, 10)}</option>)}</select></label>
          <label><span className="sr-only">Perfil de firma</span><select value={profile} onChange={e => setProfile(e.target.value as typeof profile)} className="h-10 rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs"><option value="PADES_B">B · Firma básica</option><option value="PADES_LT">LT · Fechado y evidencia</option><option value="PADES_LTA">LTA · Sello de archivo</option></select></label>
          <Button onClick={reviewBatch} disabled={!chosen.length || !fingerprint || busy}>Revisar solicitud</Button></div>
      </div>}
      <div className="hidden grid-cols-[32px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-4 border-b border-slate-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:grid">
        <input type="checkbox" aria-label="Seleccionar elegibles de esta página" disabled={!data?.canRequest || !selectable.length} checked={!!selectable.length && selectable.every(r => !!selected[r.id])} onChange={e => {
          const check = e.target.checked; setSelected(old => { const next = { ...old }; for (const r of selectable) { if (check && Object.keys(next).length < 500) next[r.id] = r; else if (!check) delete next[r.id] } return next })
        }} /><span>Estampo / ejecución</span><span>Solicitud</span><span>Firma / entrega</span><span className="text-right">Acciones</span>
      </div>
      {loading && !data ? <div role="status" className="p-12 text-center text-sm text-slate-500">Cargando estampos…</div> : !data?.rows.length ? <div className="px-5 py-14 text-center"><FileCheck2 size={32} className="mx-auto mb-3 text-slate-400" /><h3 className="font-semibold text-slate-800">No hay estampos en esta vista</h3><p className="mt-2 text-sm text-slate-500">Prueba otro rango de ejecución o cambia el estado.</p></div> :
        <div className="divide-y divide-slate-100">{data.rows.map(row => <article key={row.id} className={`grid gap-3 px-5 py-5 md:grid-cols-[32px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:gap-4 ${selected[row.id] ? 'bg-blue-50/50' : 'bg-white'}`}>
          <div>{row.status === 'ELIGIBLE' && data.canRequest && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" aria-label={`Seleccionar ${row.name}`} checked={!!selected[row.id]} onChange={() => toggle(row)} className="h-4 w-4 accent-blue-700" /><span className="md:hidden">Seleccionar estampo</span></label>}</div>
          <div className="min-w-0"><Link href={`/roles/${row.rolId}?tab=documentos`} className="text-xs font-semibold text-blue-800 hover:underline">ROL {row.rol}</Link><h3 className="mt-1 break-words text-sm font-semibold text-slate-900">{row.name}</h3><p className="mt-1 text-xs text-slate-500">Ejecución: {formatDateCL(row.businessDate)}</p>{row.exclusion && <p className="mt-2 text-xs text-amber-800">{row.exclusion}</p>}</div>
          <div className="min-w-0 text-xs text-slate-500"><p className="font-medium text-slate-700">{row.origin === 'MANUAL' ? 'Solicitud manual' : row.origin === 'AUTOMATIC' ? 'Solicitud automática' : 'Sin solicitud'}</p>{row.profile && <p className="mt-1">{row.profile.replace('PADES_', 'PAdES-')} · Intentos {row.attemptCount}/{row.maxAttempts}</p>}{row.requestedBy && <p className="mt-1 break-all">{row.requestedBy}</p>}</div>
          <div className="min-w-0"><Badge status={row.status} /><p className="mt-2 text-xs text-slate-500">{row.delivery}</p>{row.errorMessage && <p className="mt-2 text-xs leading-relaxed text-amber-900">{row.errorMessage}</p>}{row.diagnosticCode && <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">Diagnóstico del administrador</summary><code className="mt-1 block break-all">{row.diagnosticCode}</code></details>}</div>
          <div className="flex flex-wrap content-start justify-start gap-2 md:justify-end">
            {row.nextRetryAt && <p className="basis-full text-xs text-blue-800">Reintento automático desde {formatDateTimeCL(row.nextRetryAt)}. Requiere una sesión del token habilitada.</p>}
            {row.evidence && <a className="px-2 py-2 text-xs font-medium text-blue-800 underline" href={`/api/signing/archive/${row.evidence.signatureId}?checksum=${row.evidence.signedChecksum}`}>Descargar firmado</a>}
            {row.evidence && <details className="basis-full text-xs text-slate-500"><summary className="cursor-pointer">Evidencia de firma</summary><dl className="mt-2 space-y-1 break-all text-left"><dt>Certificado SHA-256</dt><dd>{row.evidence.signerFingerprint}</dd><dt>Versión firmada</dt><dd>{row.evidence.signedVersionId}</dd><dt>SHA-256 firmado</dt><dd>{row.evidence.signedChecksum}</dd><dt>Equipo firmante</dt><dd>{row.evidence.deviceId}</dd><dt>Validación</dt><dd>{formatDateTimeCL(row.evidence.validatedAt)}</dd></dl></details>}
            {row.canRetry && <Button variant="outline" onClick={() => setConfirmation({ rows: [row], action: { action: 'retry', itemId: row.itemId!, attemptCount: row.attemptCount, reviewed: true } })}>Reintentar</Button>}
            {row.canCancel && <button className="px-2 py-2 text-xs text-slate-600 underline underline-offset-4" onClick={() => setConfirmation({ rows: [row], action: { action: 'cancel', itemId: row.itemId!, attemptCount: row.attemptCount } })}>Cancelar</button>}
            <details className="basis-full text-xs text-slate-500 md:text-right"><summary className="cursor-pointer">Trazabilidad</summary><dl className="mt-2 space-y-1 break-all text-left"><dt>Documento</dt><dd>{row.documentId}</dd><dt>Versión</dt><dd>{row.versionId ?? '—'}</dd>{row.jobId && <><dt>Solicitud</dt><dd>{row.jobId}</dd></>}<dt>SHA-256 de origen</dt><dd>{row.checksum ?? '—'}</dd></dl></details>
          </div>
        </article>)}</div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-xs text-slate-500"><span>{data?.total ?? 0} resultados · Resumen superior de toda la oficina</span><div className="flex items-center gap-3"><Button variant="outline" aria-label="Página anterior" disabled={page === 1 || busy} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></Button><span>Página {page} de {Math.max(1, Math.ceil((data?.total ?? 0) / 25))}</span><Button variant="outline" aria-label="Página siguiente" disabled={!data || page * 25 >= data.total || busy} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></Button></div></footer>
    </section>
    <SignedArchive />
    <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500"><CircleHelp size={15} className="shrink-0" />En la bandeja de Windows, elige «Abrir firmados de la oficina». Todos los equipos autorizados ven la misma carpeta de consulta. Las firmas de más de 50 días permanecen en el archivo de la aplicación.</p>
    <dialog ref={dialog} aria-labelledby="signing-confirmation-title" onCancel={e => { e.preventDefault(); if (!busy) setConfirmation(null) }} className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-950/50">
      {confirmation && <div className="p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-800">Confirmación de la oficina</p><h2 className="mt-2 text-xl font-semibold" id="signing-confirmation-title">{confirmation.action.action === 'queue' ? 'Solicitar firma digital' : confirmation.action.action === 'retry-delivery' ? 'Recuperar entrega' : confirmation.action.action === 'retry' ? 'Revisar antes de reintentar' : 'Cancelar solicitud'}</h2></div><button aria-label="Cerrar confirmación" disabled={busy} onClick={() => setConfirmation(null)}><X size={20} /></button></div>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">{confirmation.action.action === 'retry-delivery' ? 'Confirma que revisaste la conexión, el espacio y los permisos del receptor. Se habilitarán hasta seis intentos de copiar el mismo archivo validado.' : confirmation.action.action === 'queue' ? `${confirmation.rows.length} estampos · ${confirmation.action.requestedLevel.replace('PADES_', 'PAdES-')}. Al confirmar autorizas su firma con el certificado seleccionado, sin otra aprobación local, mientras la sesión del token esté habilitada.` : confirmation.action.action === 'retry' ? 'Revisa el archivo y el diario local en el equipo firmante. Un intento interrumpido puede haber generado una firma. Autoriza otra operación solo después de resolver ese resultado.' : 'Se retirará de la cola. El servidor rechazará la cancelación si la firma ya comenzó.'}</p>
        {confirmation.action.action === 'queue' && <p className="mt-3 break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Certificado SHA-256: {confirmation.action.signerFingerprint}</p>}
        <ul className="my-4 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3 text-sm">{confirmation.rows.map(r => <li key={r.id}><strong>{r.rol}</strong> · {r.name}<span className="mt-1 block break-all text-xs text-slate-500">{r.documentId} · {formatDateCL(r.businessDate)}</span></li>)}</ul>
        <label className="flex items-start gap-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-950"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />{confirmation.action.action === 'retry' ? 'Detuve el trabajo anterior y revisé su resultado y los archivos locales. Confirmo que corresponde autorizar una nueva firma.' : 'Revisé los documentos y confirmo esta solicitud.'}</label>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Volver</Button><Button disabled={busy || !reviewed} onClick={() => void execute()}>{busy ? 'Procesando…' : confirmation.action.action === 'queue' ? 'Confirmar solicitud' : confirmation.action.action === 'retry-delivery' ? 'Reactivar entrega' : confirmation.action.action === 'retry' ? 'Autorizar reintento' : 'Confirmar cancelación'}</Button></div>
      </div>}
    </dialog>
  </div></div>
}
