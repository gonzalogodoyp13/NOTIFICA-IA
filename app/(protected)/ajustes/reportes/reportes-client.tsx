'use client'

import { ArrowLeft, CheckCircle2, Fingerprint, ShieldCheck, XCircle } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import ConfirmDialog from './ConfirmDialog'
import DeliveriesSection from './DeliveriesSection'
import ControlHealthStrip from './ControlHealthStrip'
import CustomReportsSection from './CustomReportsSection'
import JobsSection from './JobsSection'
import OperationsSection from './OperationsSection'
import OperationsSubnav, { type OperationsView } from './OperationsSubnav'
import RecipientsSection from './RecipientsSection'
import ReportTabs from './ReportTabs'
import SchedulesSection from './SchedulesSection'
import type { DeliveryAttemptDetail, DeliveryAttemptSummary, Paged, ReportEnvelope, ReportSection, ReportVersion } from './reportes-types'
import VersionsSection from './VersionsSection'

type Confirmation =
  | { kind: 'regenerate'; type: 'daily' | 'monthly'; period: string }
  | { kind: 'resend'; type: 'daily' | 'monthly' | 'custom'; period: string; reportId?: string; currentVersion?: number }
  | { kind: 'retry'; attempt: DeliveryAttemptSummary }
  | { kind: 'restore'; version: ReportVersion }
  | { kind: 'cleanup' }

const sectionValues: ReportSection[] = ['operations', 'versions', 'deliveries']
const operationViews: OperationsView[] = ['control', 'jobs', 'recipients', 'schedules', 'custom']

function enumParam<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && allowed.includes(value as T) ? value as T : fallback
}

function pageParam(value: string | null) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

function todayChileInput() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${lookup.year}-${lookup.month}-${lookup.day}`
}

function buildApiQuery(values: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
  })
  return params.toString()
}

export default function ReportesClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const section = enumParam(searchParams.get('section'), sectionValues, 'operations')
  const focusedReportId = searchParams.get('reportId')
  const operationsView = focusedReportId && section === 'operations' ? 'control' : enumParam(searchParams.get('view'), operationViews, 'control')
  const [date, setDate] = useState(todayChileInput())
  const [month, setMonth] = useState(todayChileInput().slice(0, 7))
  const [reports, setReports] = useState<ReportEnvelope | null>(null)
  const [versions, setVersions] = useState<Paged<ReportVersion> | null>(null)
  const [attempts, setAttempts] = useState<Paged<DeliveryAttemptSummary> | null>(null)
  const [details, setDetails] = useState<Record<string, DeliveryAttemptDetail>>({})
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [loading, setLoading] = useState<Record<ReportSection, boolean>>({ operations: false, versions: false, deliveries: false })
  const [errors, setErrors] = useState<Record<ReportSection, string | null>>({ operations: null, versions: null, deliveries: null })
  const [refresh, setRefresh] = useState<Record<ReportSection, number>>({ operations: 0, versions: 0, deliveries: 0 })
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const reportFilters = useMemo(() => ({
    page: pageParam(searchParams.get('reportPage')),
    reportType: enumParam(searchParams.get('reportType'), ['all', 'daily', 'monthly', 'custom'] as const, 'all'),
    status: enumParam(searchParams.get('reportStatus'), ['all', 'ready', 'expired'] as const, 'all'),
    deliveryStatus: enumParam(searchParams.get('reportDelivery'), ['all', 'not_sent', 'pending', 'sent', 'partial', 'failed'] as const, 'all'),
    dateFrom: searchParams.get('reportFrom') ?? '',
    dateTo: searchParams.get('reportTo') ?? '',
  }), [searchParams])
  const versionFilters = useMemo(() => ({
    page: pageParam(searchParams.get('versionPage')),
    reportType: enumParam(searchParams.get('versionType'), ['all', 'daily', 'monthly', 'custom'] as const, 'all'),
    status: enumParam(searchParams.get('versionStatus'), ['all', 'UPLOADING', 'READY', 'FAILED', 'CORRUPT', 'DELETE_PENDING', 'DELETE_FAILED', 'DELETED'] as const, 'all'),
    scope: enumParam(searchParams.get('versionScope'), ['all', 'current', 'historical'] as const, 'all'),
    dateFrom: searchParams.get('versionFrom') ?? '',
    dateTo: searchParams.get('versionTo') ?? '',
  }), [searchParams])
  const deliveryFilters = useMemo(() => ({
    page: pageParam(searchParams.get('deliveryPage')),
    reportType: enumParam(searchParams.get('deliveryType'), ['all', 'daily', 'monthly', 'custom'] as const, 'all'),
    status: enumParam(searchParams.get('deliveryStatus'), ['all', 'PENDING', 'SENDING', 'SENT', 'PARTIAL', 'FAILED', 'NO_RECIPIENTS', 'CANCELLED'] as const, 'all'),
    mode: enumParam(searchParams.get('deliveryMode'), ['all', 'MANUAL', 'SCHEDULED'] as const, 'all'),
    target: enumParam(searchParams.get('deliveryTarget'), ['all', 'ALL_AUTHORIZED', 'FAILED_ONLY'] as const, 'all'),
    dateFrom: searchParams.get('deliveryFrom') ?? '',
    dateTo: searchParams.get('deliveryTo') ?? '',
  }), [searchParams])

  const requestJson = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...init })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'No se pudo completar la acción.')
    return payload.data as T
  }, [])

  const updateUrl = useCallback((updates: Record<string, string | number | null>, push = false) => {
    const next = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '' || (value === 1 && key.endsWith('Page'))) next.delete(key)
      else next.set(key, String(value))
    })
    const url = next.size ? `${pathname}?${next.toString()}` : pathname
    if (push) router.push(url, { scroll: false })
    else router.replace(url, { scroll: false })
  }, [pathname, router, searchParams])

  const refreshSection = useCallback((target: ReportSection) => setRefresh(current => ({ ...current, [target]: current[target] + 1 })), [])
  const refreshHistories = useCallback(() => setRefresh(current => ({ operations: current.operations + 1, versions: current.versions + 1, deliveries: current.deliveries + 1 })), [])

  useEffect(() => {
    if (section !== 'operations') return
    const controller = new AbortController()
    setLoading(current => ({ ...current, operations: true })); setErrors(current => ({ ...current, operations: null }))
    const query = buildApiQuery({ ...reportFilters, reportId: focusedReportId })
    requestJson<ReportEnvelope>(`/api/reports?${query}`, { signal: controller.signal }).then(setReports).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setErrors(current => ({ ...current, operations: error instanceof Error ? error.message : 'No se pudieron cargar los reportes.' }))
    }).finally(() => { if (!controller.signal.aborted) setLoading(current => ({ ...current, operations: false })) })
    return () => controller.abort()
  }, [focusedReportId, refresh.operations, reportFilters, requestJson, section])

  useEffect(() => {
    if (section !== 'versions') return
    const controller = new AbortController()
    setLoading(current => ({ ...current, versions: true })); setErrors(current => ({ ...current, versions: null }))
    const query = buildApiQuery({ ...versionFilters, reportId: focusedReportId })
    requestJson<Paged<ReportVersion>>(`/api/reports/versions?${query}`, { signal: controller.signal }).then(setVersions).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setErrors(current => ({ ...current, versions: error instanceof Error ? error.message : 'No se pudieron cargar las versiones.' }))
    }).finally(() => { if (!controller.signal.aborted) setLoading(current => ({ ...current, versions: false })) })
    return () => controller.abort()
  }, [focusedReportId, refresh.versions, requestJson, section, versionFilters])

  useEffect(() => {
    if (section !== 'deliveries') return
    const controller = new AbortController()
    setLoading(current => ({ ...current, deliveries: true })); setErrors(current => ({ ...current, deliveries: null }))
    const query = buildApiQuery({ ...deliveryFilters, reportId: focusedReportId })
    requestJson<Paged<DeliveryAttemptSummary>>(`/api/reports/delivery-attempts?${query}`, { signal: controller.signal }).then(setAttempts).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setErrors(current => ({ ...current, deliveries: error instanceof Error ? error.message : 'No se pudieron cargar las entregas.' }))
    }).finally(() => { if (!controller.signal.aborted) setLoading(current => ({ ...current, deliveries: false })) })
    return () => controller.abort()
  }, [deliveryFilters, focusedReportId, refresh.deliveries, requestJson, section])

  useEffect(() => {
    if (section !== 'operations' || !focusedReportId || !reports?.items.some(report => report.id === focusedReportId)) return
    window.setTimeout(() => document.getElementById(`report-${focusedReportId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100)
  }, [focusedReportId, reports, section])

  const updateReportFilter = (key: keyof typeof reportFilters, value: string | number) => {
    const keys = { page: 'reportPage', reportType: 'reportType', status: 'reportStatus', deliveryStatus: 'reportDelivery', dateFrom: 'reportFrom', dateTo: 'reportTo' } as const
    updateUrl({ [keys[key]]: value, ...(key === 'page' ? {} : { reportPage: 1 }) })
  }
  const updateVersionFilter = (key: keyof typeof versionFilters, value: string | number) => {
    const keys = { page: 'versionPage', reportType: 'versionType', status: 'versionStatus', scope: 'versionScope', dateFrom: 'versionFrom', dateTo: 'versionTo' } as const
    updateUrl({ [keys[key]]: value, ...(key === 'page' ? {} : { versionPage: 1 }) })
  }
  const updateDeliveryFilter = (key: keyof typeof deliveryFilters, value: string | number) => {
    const keys = { page: 'deliveryPage', reportType: 'deliveryType', status: 'deliveryStatus', mode: 'deliveryMode', target: 'deliveryTarget', dateFrom: 'deliveryFrom', dateTo: 'deliveryTo' } as const
    updateUrl({ [keys[key]]: value, ...(key === 'page' ? {} : { deliveryPage: 1 }) })
  }

  const navigateToReport = (target: ReportSection, reportId: string) => {
    updateUrl({ section: target, reportId, ...(target === 'versions' ? { versionPage: 1, versionType: null, versionStatus: null, versionScope: null, versionFrom: null, versionTo: null } : { deliveryPage: 1, deliveryType: null, deliveryStatus: null, deliveryMode: null, deliveryTarget: null, deliveryFrom: null, deliveryTo: null }) }, true)
  }

  const executeGenerate = async (type: 'daily' | 'monthly', period: string, force: boolean) => {
    setBusyAction(`generate:${type}`); setActionError(null); setMessage(null)
    try {
      const data = await requestJson<{ id: string; status: string }>(`/api/reports/${type}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `report-generate-${crypto.randomUUID()}` }, body: JSON.stringify(type === 'daily' ? { date: period, force } : { month: period, force }) })
      setMessage(`Trabajo ${data.id.slice(0, 8)} encolado. Sigue su progreso en la vista Trabajos.`)
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No se pudo generar el reporte.') }
    finally { setBusyAction(null); setConfirmation(null) }
  }

  const executeSend = async (type: 'daily' | 'monthly' | 'custom', period: string, target: 'all' | 'failed', previousAttemptId?: string, reportId?: string) => {
    setBusyAction(`send:${type}:${period}`); setActionError(null); setMessage(null)
    const idempotencyKey = `report-${crypto.randomUUID()}`
    try {
      const effectiveReportId = reportId ?? attempts?.items.find(item => item.report.reportType === type && item.report.periodDate === period)?.report.id
      const url = type === 'custom' && effectiveReportId ? `/api/reports/${effectiveReportId}/send` : `/api/reports/${type}/send`
      const data = await requestJson<{ id: string; status: string }>(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(type === 'custom' ? { target, previousAttemptId } : { ...(type === 'daily' ? { date: period } : { month: period }), target, previousAttemptId }) })
      setMessage(`Trabajo de entrega ${data.id.slice(0, 8)} encolado. Sigue su progreso en Trabajos.`)
      setDetails({}); setExpandedAttemptId(null)
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No se pudo enviar el reporte.') }
    finally { setBusyAction(null); setConfirmation(null) }
  }

  const executeRestore = async (version: ReportVersion) => {
    setBusyAction(`restore:${version.id}`); setActionError(null); setMessage(null)
    try {
      const data = await requestJson<{ restored: boolean; versionNumber: number }>(`/api/reports/${version.reportId}/versions/${version.id}/restore`, { method: 'POST' })
      setMessage(data.restored ? `La versión ${data.versionNumber} quedó como archivo actual.` : 'Esa versión ya era la actual.')
      refreshHistories()
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No se pudo restaurar la versión.') }
    finally { setBusyAction(null); setConfirmation(null) }
  }

  const executeCleanup = async () => {
    setBusyAction('cleanup'); setActionError(null); setMessage(null)
    try {
      const data = await requestJson<{ expired: number; deletionFailures?: number; retried?: number }>('/api/reports/cleanup', { method: 'POST' })
      setMessage(`${data.expired} reportes vencidos limpiados; ${data.deletionFailures ?? 0} eliminaciones pendientes y ${data.retried ?? 0} reintentos procesados.`)
      refreshHistories()
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No se pudo completar el mantenimiento.') }
    finally { setBusyAction(null); setConfirmation(null) }
  }

  const confirmAction = () => {
    if (!confirmation) return
    if (confirmation.kind === 'regenerate') void executeGenerate(confirmation.type, confirmation.period, true)
    else if (confirmation.kind === 'resend') void executeSend(confirmation.type, confirmation.period, 'all', undefined, confirmation.reportId)
    else if (confirmation.kind === 'retry') void executeSend(confirmation.attempt.report.reportType, confirmation.attempt.report.periodDate, 'failed', confirmation.attempt.id, confirmation.attempt.report.id)
    else if (confirmation.kind === 'restore') void executeRestore(confirmation.version)
    else void executeCleanup()
  }

  const confirmationCopy = (() => {
    if (!confirmation) return { title: '', description: '', label: '' }
    if (confirmation.kind === 'regenerate') return { title: 'Regenerar reporte', description: `Se creará una nueva versión inmutable para ${confirmation.period}. La versión válida anterior permanecerá disponible.`, label: 'Regenerar' }
    if (confirmation.kind === 'resend') return { title: 'Reenviar a todos', description: `Se creará un nuevo intento para todos los administradores activos usando la versión actual${confirmation.currentVersion ? ` v${confirmation.currentVersion}` : ''}.`, label: 'Reenviar a todos' }
    if (confirmation.kind === 'retry') return { title: 'Reintentar destinatarios fallidos', description: `Se creará un intento hijo del intento ${confirmation.attempt.attemptNumber}, fijado a la versión v${confirmation.attempt.reportVersion?.versionNumber ?? '—'}.`, label: 'Reintentar fallidos' }
    if (confirmation.kind === 'restore') return { title: `Restaurar versión ${confirmation.version.versionNumber}`, description: `El reporte ${confirmation.version.report.periodDate} cambiará de la versión v${confirmation.version.report.currentVersion?.versionNumber ?? '—'} a v${confirmation.version.versionNumber}. El archivo histórico no se modificará.`, label: 'Restaurar versión' }
    return { title: 'Ejecutar mantenimiento', description: 'Se limpiarán reportes diarios vencidos y se reintentará la eliminación segura de versiones pendientes. Los registros históricos se conservarán.', label: 'Ejecutar mantenimiento' }
  })()

  const toggleAttempt = async (attempt: DeliveryAttemptSummary) => {
    if (expandedAttemptId === attempt.id) return setExpandedAttemptId(null)
    setExpandedAttemptId(attempt.id)
    if (details[attempt.id]) return
    setDetailLoading(attempt.id)
    try {
      const detail = await requestJson<DeliveryAttemptDetail>(`/api/reports/delivery-attempts/${attempt.id}`)
      setDetails(current => ({ ...current, [attempt.id]: detail }))
    }
    catch (error) { setActionError(error instanceof Error ? error.message : 'No se pudo cargar el detalle del intento.'); setExpandedAttemptId(null) }
    finally { setDetailLoading(null) }
  }

  const copyValue = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage('Checksum copiado al portapapeles.'); setActionError(null) }
    catch { setActionError('No se pudo copiar el checksum. Selecciónalo manualmente.') }
  }

  const panelMessage = (value: string, error = false) => {
    if (error) { setActionError(value); setMessage(null) }
    else { setMessage(value); setActionError(null) }
  }

  return <main className="page-frame page-stack">
    <section className="page-header relative overflow-hidden"><div className="absolute inset-y-0 right-0 hidden w-72 opacity-40 soft-grid lg:block" aria-hidden="true" /><div className="relative"><div className="page-kicker">Auditoría · Centro de control</div><h1 className="page-title">Reportes</h1><p className="page-copy">Genera, verifica y entrega reportes con una cadena de custodia visible de extremo a extremo.</p></div><div className="app-panel-muted relative flex max-w-md items-start gap-3 px-4 py-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p className="text-sm leading-6 text-slate-600">Acceso exclusivo para administradores activos. Cada descarga valida el checksum y registra la operación antes de entregar el archivo.</p></div></section>
    <ReportTabs active={section} />
    <div aria-live="polite" aria-atomic="true" className="mt-6 space-y-3">{message && <div role="status" className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</span><button type="button" onClick={() => setMessage(null)} aria-label="Cerrar mensaje">×</button></div>}{actionError && <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"><span className="flex items-start gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{actionError}</span><button type="button" onClick={() => setActionError(null)} aria-label="Cerrar error">×</button></div>}</div>
    <div className="mt-6">
      {section === 'operations' && <>
        <OperationsSubnav active={operationsView} />
        {operationsView === 'control' && <div id="operations-panel-control" role="tabpanel" aria-labelledby="operations-view-control"><ControlHealthStrip /><OperationsSection data={reports} loading={loading.operations} error={errors.operations} filters={reportFilters} focusedReportId={focusedReportId} date={date} month={month} busyAction={busyAction} onDateChange={setDate} onMonthChange={setMonth} onFilterChange={updateReportFilter} onRefresh={() => refreshSection('operations')} onGenerate={(type, period, force) => force ? setConfirmation({ kind: 'regenerate', type, period }) : void executeGenerate(type, period, false)} onSend={(type, period, previousAttemptId) => previousAttemptId ? setConfirmation({ kind: 'resend', type, period, currentVersion: reports?.items.find(report => report.reportType === type && report.periodDate === period)?.currentVersion?.versionNumber }) : void executeSend(type, period, 'all')} onCleanup={() => setConfirmation({ kind: 'cleanup' })} onNavigate={navigateToReport} /></div>}
        {operationsView === 'jobs' && <JobsSection onMessage={panelMessage} />}
        {operationsView === 'recipients' && <RecipientsSection onMessage={panelMessage} />}
        {operationsView === 'schedules' && <SchedulesSection onMessage={panelMessage} />}
        {operationsView === 'custom' && <CustomReportsSection onMessage={panelMessage} />}
      </>}
      {section === 'versions' && <VersionsSection data={versions} loading={loading.versions} error={errors.versions} filters={versionFilters} focusedReportId={focusedReportId} busyAction={busyAction} onFilterChange={updateVersionFilter} onRefresh={() => refreshSection('versions')} onRestore={version => setConfirmation({ kind: 'restore', version })} onCopy={copyValue} onClearReport={() => updateUrl({ reportId: null, versionPage: 1 })} />}
      {section === 'deliveries' && <DeliveriesSection data={attempts} loading={loading.deliveries} error={errors.deliveries} filters={deliveryFilters} focusedReportId={focusedReportId} expandedAttemptId={expandedAttemptId} details={details} detailLoading={detailLoading} busyAction={busyAction} onFilterChange={updateDeliveryFilter} onRefresh={() => refreshSection('deliveries')} onToggle={toggleAttempt} onRetry={attempt => setConfirmation({ kind: 'retry', attempt })} onResend={attempt => setConfirmation({ kind: 'resend', type: attempt.report.reportType, period: attempt.report.periodDate, currentVersion: attempt.report.currentVersion?.versionNumber })} onCopy={copyValue} onClearReport={() => updateUrl({ reportId: null, deliveryPage: 1 })} />}
    </div>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3"><Link href="/ajustes" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"><ArrowLeft className="h-4 w-4" />Volver a Ajustes</Link><span className="inline-flex items-center gap-2 text-xs text-slate-500"><Fingerprint className="h-4 w-4" />Archivos privados · SHA-256 · Auditoría obligatoria</span></div>
    <ConfirmDialog open={!!confirmation} title={confirmationCopy.title} description={confirmationCopy.description} confirmLabel={confirmationCopy.label} destructive={confirmation?.kind === 'cleanup'} busy={!!busyAction} onConfirm={confirmAction} onClose={() => { if (!busyAction) setConfirmation(null) }} />
  </main>
}
