// Registros de Auditoría page
// View and filter audit logs from the system
'use client'

import { useEffect, useState, useCallback } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import LogFilterBar from './components/LogFilterBar'
import LogTable from './components/LogTable'
import LogDiffModal from './components/LogDiffModal'
import ExportButtons from './components/ExportButtons'
import LogsSummary from './components/LogsSummary'

interface AuditLog {
  id: number
  userId: string
  officeId: number
  tabla: string
  accion: string
  diff: any
  createdAt: string
  user: {
    id: string
    email: string
  } | null
  office: {
    id: number
    nombre: string
  } | null
}

interface UnmatchedReply {
  id: string
  provider: string
  senderEmail: string
  subject: string
  textPreview: string
  receivedAt: string
  matchStatus: 'unmatched' | 'needs_review'
}

export default function LogsPage() {
  const [source, setSource] = useState<'activity' | 'legacy'>('activity')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [unmatchedReplies, setUnmatchedReplies] = useState<UnmatchedReply[]>([])
  const [unmatchedLoading, setUnmatchedLoading] = useState(true)
  const [filters, setFilters] = useState<{
    userId?: string
    tabla?: string
    accion?: string
    from?: string
    to?: string
  }>({})

  const fetchLogs = useCallback(async (customFilters?: typeof filters) => {
    setLoading(true)
    setError(null)

    try {
      const activeFilters = customFilters || filters
      const params = new URLSearchParams()
      params.set('source', source)

      if (activeFilters.userId) params.append('userId', activeFilters.userId)
      if (activeFilters.tabla) params.append('tabla', activeFilters.tabla)
      if (activeFilters.accion) params.append('accion', activeFilters.accion)
      if (activeFilters.from) params.append('from', activeFilters.from)
      if (activeFilters.to) params.append('to', activeFilters.to)

      const response = await fetch(`/api/logs?${params.toString()}`, {
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.ok) {
        const errorMessage =
          data.error || 'Error al cargar los registros de auditoría'
        throw new Error(errorMessage)
      }

      setLogs(data.data || [])
      setError(null)
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Error al cargar los registros de auditoría'
      setError(errorMessage)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [filters, source])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    fetch('/api/recibos/send/replies/unmatched?limit=10', { credentials: 'include' })
      .then(response => response.json())
      .then(payload => { if (payload.ok) setUnmatchedReplies(payload.data ?? []) })
      .catch(() => undefined)
      .finally(() => setUnmatchedLoading(false))
  }, [])

  const handleFilter = (newFilters: typeof filters) => {
    setFilters(newFilters)
    fetchLogs(newFilters)
  }

  const handleViewDetail = (log: AuditLog) => {
    setSelectedLog(log)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedLog(null)
  }

  return (
    <div className="min-h-screen bg-white">
      <Topbar />

      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">
              Registros de Auditoría
            </h1>
            <p className="text-gray-600">
              Visualiza y filtra todos los cambios realizados en el sistema
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {source === 'activity' && <LogsSummary />}

          <div className="mb-6 flex gap-2 border-b border-gray-200" role="tablist" aria-label="Fuente de auditoria">
            <button
              type="button"
              role="tab"
              aria-selected={source === 'activity'}
              onClick={() => setSource('activity')}
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${source === 'activity' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              Actividad canónica
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === 'legacy'}
              onClick={() => setSource('legacy')}
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${source === 'legacy' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              Histórico anterior
            </button>
          </div>

          <section className="mb-6 border-y border-gray-200 py-5">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-gray-900">Respuestas sin asociar</h2><p className="mt-1 text-sm text-gray-600">Mensajes que requieren revision manual y no alteran el historial de envios.</p></div>
              <span className="text-sm font-semibold text-gray-700">{unmatchedReplies.length}</span>
            </div>
            {unmatchedLoading ? <div className="mt-4 text-sm text-gray-500">Cargando respuestas...</div> : !unmatchedReplies.length ? <div className="mt-4 text-sm text-gray-500">No hay respuestas pendientes de asociacion.</div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Remitente</th><th className="px-3 py-2">Asunto</th><th className="px-3 py-2">Vista previa</th></tr></thead><tbody className="divide-y divide-gray-100">{unmatchedReplies.map(reply => <tr key={reply.id}><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${reply.matchStatus === 'needs_review' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{reply.matchStatus === 'needs_review' ? 'Revisar' : 'Sin asociar'}</span></td><td className="px-3 py-3 whitespace-nowrap">{new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(reply.receivedAt))}</td><td className="px-3 py-3">{reply.senderEmail}</td><td className="px-3 py-3">{reply.subject || 'Sin asunto'}</td><td className="px-3 py-3 text-gray-600">{reply.textPreview}</td></tr>)}</tbody></table></div>}
          </section>

          <LogFilterBar onFilter={handleFilter} loading={loading} />

          <ExportButtons source={source} />

          <LogTable logs={logs} loading={loading} onViewDetail={handleViewDetail} />

          <div className="mt-8 flex items-center gap-4 flex-wrap">
            <Link
              href="/ajustes"
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2"
            >
              ← Volver a Ajustes
            </Link>
            <span className="text-gray-400">•</span>
            <Link
              href="/dashboard"
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2"
            >
              ← Volver al Dashboard
            </Link>
          </div>
        </div>
      </main>

      {selectedLog && (
        <LogDiffModal
          isOpen={showModal}
          onClose={handleCloseModal}
          diff={selectedLog.diff}
          tabla={selectedLog.tabla}
          accion={selectedLog.accion}
        />
      )}
    </div>
  )
}

