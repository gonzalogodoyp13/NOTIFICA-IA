'use client'

import { useEffect, useState } from 'react'

interface SummaryData {
  total: number
  actionBreakdown: {
    CREATE: number
    UPDATE: number
    DELETE: number
  }
  topUsers: Array<{
    userId: string
    email: string
    count: number
  }>
  activityByDay: Array<{
    date: string
    dayName: string
    count: number
  }>
}

export default function LogsSummary() {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSummary()
  }, [])

  const fetchSummary = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/logs/summary', {
        credentials: 'include',
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Error al cargar el resumen')
      }

      setData(result.data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
        <div className="text-center py-8">
          <p className="text-gray-600">Cargando resumen de actividad...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <p className="text-red-800">{error}</p>
      </div>
    )
  }

  if (!data) {
    return null
  }

  // Calculate max count for bar chart scaling
  const maxCount = Math.max(
    ...data.activityByDay.map((d) => d.count),
    1 // Avoid division by zero
  )

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        Resumen de Actividad
      </h2>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-600 mb-1">
            Total Registros
          </p>
          <p className="text-2xl font-bold text-blue-900">{data.total}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-medium text-green-600 mb-1">CREATE</p>
          <p className="text-2xl font-bold text-green-900">
            {data.actionBreakdown.CREATE}
          </p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm font-medium text-yellow-600 mb-1">UPDATE</p>
          <p className="text-2xl font-bold text-yellow-900">
            {data.actionBreakdown.UPDATE}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-600 mb-1">DELETE</p>
          <p className="text-2xl font-bold text-red-900">
            {data.actionBreakdown.DELETE}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Chart */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Actividad (Últimos 7 días)
          </h3>
          <div className="space-y-2">
            {data.activityByDay.map((day) => {
              const percentage = (day.count / maxCount) * 100
              return (
                <div key={day.date} className="flex items-center gap-3">
                  <div className="w-12 text-xs text-gray-600 font-medium">
                    {day.dayName}
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-300 flex items-center justify-end pr-2"
                      style={{ width: `${percentage}%` }}
                    >
                      {day.count > 0 && (
                        <span className="text-xs font-medium text-white">
                          {day.count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top Users */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Top Usuarios
          </h3>
          {data.topUsers.length > 0 ? (
            <div className="space-y-3">
              {data.topUsers.map((user, index) => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {user.email}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user.count} {user.count === 1 ? 'registro' : 'registros'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No hay datos disponibles</p>
          )}
        </div>
      </div>
    </div>
  )
}

