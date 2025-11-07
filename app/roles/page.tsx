// Gestión de Demandas - List page
// Shows all Demandas in a responsive table
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Topbar from '@/components/Topbar'

interface Demanda {
  id: string
  rol: string
  caratula: string
  cuantia: number
  createdAt: string
  tribunal: {
    id: number
    nombre: string
  }
  abogado: {
    id: number
    nombre: string | null
  }
}

export default function RolesPage() {
  const router = useRouter()
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDemandas()
  }, [])

  const fetchDemandas = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/roles')
      const result = await response.json()

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Error al cargar las demandas')
      }

      setDemandas(result.data || [])
    } catch (err: any) {
      console.error('Error fetching demandas:', err)
      setError(err.message || 'Error al cargar las demandas')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header with search and button */}
          <div className="mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                  Gestión de Demandas
                </h1>
                <p className="text-gray-600">
                  Visualiza y gestiona todas tus demandas registradas
                </p>
              </div>
              <Link
                href="/demandas/nueva"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium inline-flex items-center gap-2"
              >
                + Nueva Demanda
              </Link>
            </div>

            {/* Search bar (placeholder for now) */}
            <div className="max-w-md">
              <input
                type="text"
                placeholder="Buscar por ROL, carátula, tribunal o abogado..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled
              />
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <p className="text-gray-600">Cargando demandas...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
              <button
                onClick={fetchDemandas}
                className="mt-2 text-red-600 hover:text-red-800 underline text-sm"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && demandas.length === 0 && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-gray-600 text-lg mb-2">
                  No hay demandas registradas
                </p>
                <p className="text-gray-500 text-sm mb-4">
                  Crea tu primera demanda haciendo clic en "Nueva Demanda"
                </p>
                <Link
                  href="/demandas/nueva"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  + Nueva Demanda
                </Link>
              </div>
            </div>
          )}

          {/* Table view (desktop) */}
          {!loading && !error && demandas.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ROL
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Carátula
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tribunal
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Abogado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fecha Creación
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {demandas.map((demanda) => (
                        <tr
                          key={demanda.id}
                          onClick={() => router.push(`/roles/${demanda.id}`)}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {demanda.rol}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {demanda.caratula}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {demanda.tribunal.nombre}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {demanda.abogado.nombre || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(demanda.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-4">
                {demandas.map((demanda) => (
                  <div
                    key={demanda.id}
                    onClick={() => router.push(`/roles/${demanda.id}`)}
                    className="bg-white rounded-lg shadow-md border border-gray-200 p-4 cursor-pointer hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {demanda.rol}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {demanda.caratula}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex items-center text-gray-600">
                        <span className="font-medium mr-2">Tribunal:</span>
                        <span>{demanda.tribunal.nombre}</span>
                      </div>
                      <div className="flex items-center text-gray-600">
                        <span className="font-medium mr-2">Abogado:</span>
                        <span>{demanda.abogado.nombre || '-'}</span>
                      </div>
                      <div className="flex items-center text-gray-500 text-xs mt-2">
                        <span>{formatDate(demanda.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Navigation links */}
          <div className="mt-8 flex items-center gap-4 flex-wrap">
            <Link
              href="/dashboard"
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2"
            >
              ← Volver al Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

