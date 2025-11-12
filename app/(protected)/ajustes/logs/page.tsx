// Registros de Auditoría page
// View and filter audit logs from the system
'use client'

import { useEffect, useState } from 'react'
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

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [filters, setFilters] = useState<{
    userId?: string
    tabla?: string
    accion?: string
    from?: string
    to?: string
  }>({})

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async (customFilters?: typeof filters) => {
    setLoading(true)
    setError(null)

    try {
      const activeFilters = customFilters || filters
      const params = new URLSearchParams()

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
  }

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

          <LogsSummary />

          <LogFilterBar onFilter={handleFilter} loading={loading} />

          <ExportButtons />

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

