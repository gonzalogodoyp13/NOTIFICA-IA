// Gestionar Roles (Casos ROL) page
// Lists all ROL cases for the current office
'use client'

import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface Rol {
  id: string
  rol: string
  estado: string
  createdAt: string
  tribunal: {
    nombre: string
  }
  demanda: {
    caratula: string
  } | null
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Rol[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await fetch('/api/roles', {
          credentials: 'include', // Ensure cookies are sent
        })
        if (!response.ok) {
          // Don't redirect - layout handles auth. Just show error
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Error al cargar los roles')
        }
        const data = await response.json()
        if (data.ok) {
          setRoles(data.data || [])
        } else {
          setError(data.error || 'Error al cargar los roles')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }

    fetchRoles()
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      
      {/* Main content area with padding for fixed topbar */}
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                Gestionar Roles (Casos ROL)
              </h1>
              <p className="text-gray-600">
                Visualiza y administra todos tus casos ROL
              </p>
            </div>
            <Link
              href="/demandas/nueva"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Nuevo Caso
            </Link>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <p className="text-gray-600">Cargando casos...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Roles list */}
          {!loading && !error && (
            <>
              {roles.length === 0 ? (
                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
                  <div className="text-center py-12">
                    <div className="text-4xl mb-4">📋</div>
                    <p className="text-gray-600 text-lg">
                      No hay casos ROL registrados aún.
                    </p>
                    <p className="text-gray-500 text-sm mt-2">
                      Crea tu primer caso desde el botón "Nuevo Caso" arriba.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
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
                          Estado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fecha
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {roles.map((rol) => (
                        <tr key={rol.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {rol.rol}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {rol.demanda?.caratula || 'Sin carátula'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {rol.tribunal.nombre}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              rol.estado === 'terminado' ? 'bg-green-100 text-green-800' :
                              rol.estado === 'en_proceso' ? 'bg-blue-100 text-blue-800' :
                              rol.estado === 'archivado' ? 'bg-gray-100 text-gray-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {rol.estado.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(rol.createdAt).toLocaleDateString('es-CL')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <Link
                              href={`/roles/${rol.id}`}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Ver detalles
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Back links */}
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

