'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, FileSpreadsheet, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ReportRow = {
  id: string
  reportType: string
  periodDate: string
  status: string
  fileName: string
  sizeBytes: number
  activityCount: number
  generatedAt: string
  expiresAt: string | null
  createdBy?: { email: string } | null
}

function todayChileInput() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${lookup.year}-${lookup.month}-${lookup.day}`
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function formatBytes(value: number) {
  if (!value) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export default function ReportesClient({ isOfficeAdmin }: { isOfficeAdmin: boolean }) {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [date, setDate] = useState(todayChileInput())
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [force, setForce] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const readyReports = useMemo(() => reports.filter(report => report.status === 'ready'), [reports])

  const loadReports = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/reports', { credentials: 'include', cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'No se pudieron cargar los reportes.')
      setReports(payload.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los reportes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReports()
  }, [])

  const generate = async () => {
    setWorking(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/reports/daily/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateInputRef.current?.value || date, force }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'No se pudo generar el reporte.')
      if (payload.data.status === 'no_activity') setMessage('No hubo actividad humana para esa fecha; no se creo reporte.')
      if (payload.data.status === 'existing') setMessage('Ya existia un reporte para esa fecha; se mantuvo el archivo actual.')
      if (payload.data.status === 'generated') setMessage('Reporte diario generado correctamente.')
      setForce(false)
      await loadReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte.')
    } finally {
      setWorking(false)
    }
  }

  const cleanup = async () => {
    setWorking(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/reports/cleanup', { method: 'POST', credentials: 'include' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'No se pudo limpiar reportes.')
      setMessage(`${payload.data.expired} reportes vencidos limpiados.`)
      await loadReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo limpiar reportes.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <main className="page-frame page-stack">
      <section className="page-header">
        <div>
          <div className="page-kicker">Auditoria</div>
          <h1 className="page-title">Reportes diarios</h1>
          <p className="page-copy">Genera, revisa y descarga reportes diarios de actividad por oficina.</p>
        </div>
        <div className="app-panel-muted flex min-w-[260px] items-start gap-3 px-4 py-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-700" />
          <p className="text-sm leading-6 text-slate-600">
            Los reportes se generan por oficina y solo usuarios de la misma oficina pueden descargarlos.
          </p>
        </div>
      </section>

      {isOfficeAdmin && (
        <section className="app-section p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Fecha a reportar
              <Input ref={dateInputRef} type="date" value={date} onChange={event => setDate(event.target.value)} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={force} onChange={event => setForce(event.target.checked)} />
                Regenerar
              </label>
              <Button onClick={generate} disabled={working || !date}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {working ? 'Procesando...' : 'Generar diario'}
              </Button>
              <Button variant="outline" onClick={cleanup} disabled={working}>
                <Trash2 className="mr-2 h-4 w-4" />
                Limpiar vencidos
              </Button>
            </div>
          </div>
        </section>
      )}

      {!isOfficeAdmin && (
        <section className="app-panel-muted px-4 py-3 text-sm text-slate-600">
          Puedes descargar reportes de tu oficina. La generacion manual queda reservada para administradores.
        </section>
      )}

      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}

      <section className="app-section overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Historial</h2>
            <p className="text-sm text-slate-500">{loading ? 'Cargando reportes...' : `${readyReports.length} reportes disponibles`}</p>
          </div>
          <Button variant="outline" onClick={loadReports} disabled={loading || working}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                {['Tipo', 'Periodo', 'Estado', 'Actividad', 'Tamano', 'Generado', 'Vence', 'Accion'].map(header => (
                  <th key={header} className="px-4 py-3">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && reports.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Sin reportes generados.</td></tr>
              )}
              {reports.map(report => (
                <tr key={report.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-semibold">Diario</td>
                  <td className="px-4 py-3">{report.periodDate}</td>
                  <td className="px-4 py-3">{report.status === 'ready' ? 'Disponible' : 'Vencido'}</td>
                  <td className="px-4 py-3">{report.activityCount}</td>
                  <td className="px-4 py-3">{formatBytes(report.sizeBytes)}</td>
                  <td className="px-4 py-3">{formatDateTime(report.generatedAt)}</td>
                  <td className="px-4 py-3">{formatDateTime(report.expiresAt)}</td>
                  <td className="px-4 py-3">
                    {report.status === 'ready' ? (
                      <a href={`/api/reports/${report.id}/download`} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">
                        <Download className="h-4 w-4" />
                        Descargar
                      </a>
                    ) : (
                      <span className="text-slate-400">No disponible</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Link href="/ajustes" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-white">
        <ArrowLeft className="h-4 w-4" />
        Volver a Ajustes
      </Link>
    </main>
  )
}
