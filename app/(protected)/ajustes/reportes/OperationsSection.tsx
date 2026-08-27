'use client'

import { AlertTriangle, CalendarDays, Download, FileCheck2, FileSpreadsheet, History, Inbox, RefreshCw, RotateCcw, Send, ShieldCheck, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import PaginationBar from './PaginationBar'
import { EmptyBlock, ErrorBlock, formatBytes, formatDateTime, LoadingBlock, reportTypeLabel, selectClassName, StatusBadge } from './reportes-ui'
import type { ReportEnvelope, ReportRow, ReportSection } from './reportes-types'

type Filters = { page: number; reportType: string; status: string; deliveryStatus: string; dateFrom: string; dateTo: string }

type Props = {
  data: ReportEnvelope | null
  loading: boolean
  error: string | null
  filters: Filters
  focusedReportId: string | null
  date: string
  month: string
  busyAction: string | null
  onDateChange: (value: string) => void
  onMonthChange: (value: string) => void
  onFilterChange: (key: keyof Filters, value: string | number) => void
  onRefresh: () => void
  onGenerate: (type: 'daily' | 'monthly', period: string, force: boolean) => void
  onSend: (type: 'daily' | 'monthly' | 'custom', period: string, previousAttemptId?: string) => void
  onCleanup: () => void
  onNavigate: (section: ReportSection, reportId: string) => void
}

const emptyPagination = { page: 1, limit: 25, total: 0, totalPages: 0 }

function OperationCard({ type, period, busyAction, report, onPeriodChange, onGenerate, onSend }: { type: 'daily' | 'monthly'; period: string; busyAction: string | null; report?: ReportRow; onPeriodChange: (value: string) => void; onGenerate: (force: boolean) => void; onSend: () => void }) {
  const daily = type === 'daily'
  return <article className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
    <div className={`absolute inset-y-0 left-0 w-1 ${daily ? 'bg-blue-600' : 'bg-cyan-600'}`} />
    <div className="flex items-start justify-between gap-4"><div><div className="page-kicker">{daily ? 'Cierre diario' : 'Consolidado mensual'}</div><h3 className="mt-2 text-xl font-semibold text-slate-950">Reporte {daily ? 'diario' : 'mensual'}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{daily ? 'Actividad del día según horario de Chile.' : 'Actividad, facturación y trazabilidad del mes.'}</p></div><span className={`rounded-2xl p-3 ${daily ? 'bg-blue-50 text-blue-700' : 'bg-cyan-50 text-cyan-700'}`}><CalendarDays className="h-5 w-5" /></span></div>
    <label className="mt-5 block space-y-2 text-sm font-semibold text-slate-700"><span>{daily ? 'Fecha' : 'Mes'}</span><Input type={daily ? 'date' : 'month'} value={period} onChange={event => onPeriodChange(event.target.value)} /></label>
    <div className="mt-4 min-h-7 text-xs text-slate-500">{report ? <span className="inline-flex items-center gap-2"><StatusBadge value={report.status} />v{report.currentVersion?.versionNumber ?? '—'} · {report.deliveryAttemptCount} intentos</span> : 'El sistema validará si existe un archivo para este periodo.'}</div>
    <div className="mt-5 grid gap-2 sm:grid-cols-3"><Button aria-label={`Generar ${daily ? 'diario' : 'mensual'}`} onClick={() => onGenerate(false)} disabled={!period || !!busyAction}><FileSpreadsheet className="mr-2 h-4 w-4" />Generar</Button><Button aria-label={`Regenerar ${daily ? 'diario' : 'mensual'}`} variant="outline" onClick={() => onGenerate(true)} disabled={!period || !!busyAction}><RotateCcw className="mr-2 h-4 w-4" />Regenerar</Button><Button aria-label={`${report?.latestDeliveryAttempt ? 'Reenviar' : 'Enviar'} ${daily ? 'diario' : 'mensual'}`} variant="outline" onClick={onSend} disabled={!period || !!busyAction}><Send className="mr-2 h-4 w-4" />{report?.latestDeliveryAttempt ? 'Reenviar' : 'Enviar'}</Button></div>
  </article>
}

function ReportActions({ report, busy, onSend, onNavigate }: { report: ReportRow; busy: boolean; onSend?: () => void; onNavigate: (section: ReportSection) => void }) {
  return <div className="flex flex-wrap gap-2">
    {report.status === 'ready' && <a href={`/api/reports/${report.id}/download`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><Download className="h-3.5 w-3.5" />Descargar</a>}
    {report.status === 'ready' && report.reportType !== 'custom' && onSend && <button type="button" onClick={onSend} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-50"><Send className="h-3.5 w-3.5" />{report.latestDeliveryAttempt ? 'Reenviar' : 'Enviar'}</button>}
    <button type="button" onClick={() => onNavigate('versions')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"><FileCheck2 className="h-3.5 w-3.5" />Versiones</button>
    <button type="button" onClick={() => onNavigate('deliveries')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"><History className="h-3.5 w-3.5" />Entregas</button>
  </div>
}

export default function OperationsSection(props: Props) {
  const reports = props.data?.items ?? []
  const dailyReport = reports.find(report => report.reportType === 'daily' && report.periodDate === props.date)
  const monthlyReport = reports.find(report => report.reportType === 'monthly' && report.periodDate === props.month)
  const summary = props.data?.summary ?? { availableReports: 0, retainedVersions: 0, deliveryAttempts: 0, needsAttention: 0 }
  const metrics = [
    { label: 'Reportes disponibles', value: summary.availableReports, icon: FileSpreadsheet, tone: 'text-blue-700 bg-blue-50' },
    { label: 'Versiones retenidas', value: summary.retainedVersions, icon: ShieldCheck, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Intentos de entrega', value: summary.deliveryAttempts, icon: Send, tone: 'text-cyan-700 bg-cyan-50' },
    { label: 'Requieren atención', value: summary.needsAttention, icon: AlertTriangle, tone: summary.needsAttention ? 'text-amber-800 bg-amber-50' : 'text-slate-600 bg-slate-100' },
  ]
  return <section id="reports-panel-operations" role="tabpanel" aria-labelledby="reports-tab-operations" className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <article key={metric.label} className="app-panel flex items-center justify-between gap-4 p-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{metric.label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{metric.value}</p></div><span className={`rounded-2xl p-3 ${metric.tone}`}><metric.icon className="h-5 w-5" /></span></article>)}</div>
    <div className="grid gap-4 xl:grid-cols-2"><OperationCard type="daily" period={props.date} report={dailyReport} busyAction={props.busyAction} onPeriodChange={props.onDateChange} onGenerate={force => props.onGenerate('daily', props.date, force)} onSend={() => props.onSend('daily', props.date, dailyReport?.latestDeliveryAttempt?.id)} /><OperationCard type="monthly" period={props.month} report={monthlyReport} busyAction={props.busyAction} onPeriodChange={props.onMonthChange} onGenerate={force => props.onGenerate('monthly', props.month, force)} onSend={() => props.onSend('monthly', props.month, monthlyReport?.latestDeliveryAttempt?.id)} /></div>
    <section className="app-section overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-5 sm:px-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="page-kicker">Inventario verificado</div><h2 className="mt-2 text-xl font-semibold text-slate-950">Periodos reportados</h2><p className="mt-1 text-sm text-slate-600">Cada fila representa un periodo lógico y apunta a una versión inmutable.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={props.onRefresh} disabled={props.loading}><RefreshCw className={`mr-2 h-4 w-4 ${props.loading ? 'animate-spin' : ''}`} />Actualizar</Button><Button size="sm" variant="outline" onClick={props.onCleanup} disabled={!!props.busyAction}><Trash2 className="mr-2 h-4 w-4" />Mantenimiento</Button></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><label className="space-y-1 text-xs font-semibold text-slate-600">Tipo<select className={`${selectClassName} w-full`} value={props.filters.reportType} onChange={event => props.onFilterChange('reportType', event.target.value)}><option value="all">Todos</option><option value="daily">Diarios</option><option value="monthly">Mensuales</option><option value="custom">Personalizados</option></select></label><label className="space-y-1 text-xs font-semibold text-slate-600">Estado<select className={`${selectClassName} w-full`} value={props.filters.status} onChange={event => props.onFilterChange('status', event.target.value)}><option value="all">Todos</option><option value="ready">Disponibles</option><option value="expired">Vencidos</option></select></label><label className="space-y-1 text-xs font-semibold text-slate-600">Entrega<select className={`${selectClassName} w-full`} value={props.filters.deliveryStatus} onChange={event => props.onFilterChange('deliveryStatus', event.target.value)}><option value="all">Todas</option><option value="not_sent">No enviados</option><option value="pending">Pendientes</option><option value="sent">Enviados</option><option value="partial">Parciales</option><option value="failed">Fallidos</option></select></label><label className="space-y-1 text-xs font-semibold text-slate-600">Desde<Input type="date" value={props.filters.dateFrom} onChange={event => props.onFilterChange('dateFrom', event.target.value)} /></label><label className="space-y-1 text-xs font-semibold text-slate-600">Hasta<Input type="date" value={props.filters.dateTo} onChange={event => props.onFilterChange('dateTo', event.target.value)} /></label></div>
      </div>
      <div className="p-4 sm:p-6">{props.error ? <ErrorBlock message={props.error} onRetry={props.onRefresh} /> : props.loading && !props.data ? <LoadingBlock label="Cargando inventario de reportes…" /> : !reports.length ? <EmptyBlock icon={<Inbox className="h-6 w-6" />} title="No hay reportes para estos filtros" copy="Ajusta el rango o genera un reporte para comenzar el historial." /> : <>
        <div className="space-y-3 lg:hidden">{reports.map(report => <article id={`report-${report.id}`} key={report.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${props.focusedReportId === report.id ? 'border-blue-500 ring-4 ring-blue-100' : 'border-slate-200'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{reportTypeLabel(report.reportType)}</p><h3 className="mt-1 text-lg font-semibold text-slate-950">{report.periodDate}</h3></div><StatusBadge value={report.status} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Versión actual</dt><dd className="mt-1 font-semibold">v{report.currentVersion?.versionNumber ?? '—'} · {report.retainedVersionCount} retenidas</dd></div><div><dt className="text-xs text-slate-500">Entrega</dt><dd className="mt-1"><StatusBadge value={report.deliveryStatus} /></dd></div><div><dt className="text-xs text-slate-500">Actividad</dt><dd className="mt-1 font-semibold">{report.activityCount}</dd></div><div><dt className="text-xs text-slate-500">Tamaño</dt><dd className="mt-1 font-semibold">{formatBytes(report.sizeBytes)}</dd></div></dl><p className="mt-4 text-xs text-slate-500">Generado {formatDateTime(report.generatedAt)}</p><div className="mt-4"><ReportActions report={report} busy={!!props.busyAction} onSend={() => props.onSend(report.reportType, report.periodDate, report.latestDeliveryAttempt?.id)} onNavigate={section => props.onNavigate(section, report.id)} /></div></article>)}</div>
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-slate-100/80 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Periodo</th><th className="px-4 py-3">Archivo actual</th><th className="px-4 py-3">Entrega</th><th className="px-4 py-3">Actividad</th><th className="px-4 py-3">Generado</th><th className="px-4 py-3">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{reports.map(report => <tr id={`report-${report.id}`} key={report.id} className={`align-top transition-colors ${props.focusedReportId === report.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : 'hover:bg-slate-50/70'}`}><td className="px-4 py-4"><div className="font-semibold text-slate-950">{report.periodDate}</div><div className="mt-1 text-xs text-slate-500">{reportTypeLabel(report.reportType)}</div></td><td className="px-4 py-4"><div className="flex items-center gap-2"><StatusBadge value={report.status} /><span className="font-semibold">v{report.currentVersion?.versionNumber ?? '—'}</span></div><div className="mt-2 text-xs text-slate-500">{report.retainedVersionCount} retenidas · {formatBytes(report.sizeBytes)}</div></td><td className="px-4 py-4"><StatusBadge value={report.deliveryStatus} /><div className="mt-2 text-xs text-slate-500">{report.deliveryAttemptCount} intentos</div></td><td className="px-4 py-4 font-semibold text-slate-800">{report.activityCount}</td><td className="px-4 py-4 text-xs text-slate-600">{formatDateTime(report.generatedAt)}<div className="mt-1 max-w-44 truncate">{report.createdBy?.email ?? 'Sistema'}</div></td><td className="px-4 py-4"><ReportActions report={report} busy={!!props.busyAction} onSend={() => props.onSend(report.reportType, report.periodDate, report.latestDeliveryAttempt?.id)} onNavigate={section => props.onNavigate(section, report.id)} /></td></tr>)}</tbody></table></div>
      </>}</div>
      <PaginationBar pagination={props.data?.pagination ?? emptyPagination} loading={props.loading} noun="reporte" onPageChange={page => props.onFilterChange('page', page)} />
    </section>
  </section>
}
