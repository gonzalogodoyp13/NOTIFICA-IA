// Gestión de Demandas - Detail page
// Shows full details of a single Demanda
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Topbar from '@/components/Topbar'

interface Ejecutado {
  id: string
  nombre: string
  rut: string
  direccion: string | null
  comuna: {
    id: number
    nombre: string
    region: string | null
  } | null
}

interface Demanda {
  id: string
  rol: string
  caratula: string
  cuantia: number
  createdAt: string
  tribunal: {
    id: number
    nombre: string
    direccion: string | null
    comuna: string | null
  }
  abogado: {
    id: number
    nombre: string | null
    rut: string | null
    direccion: string | null
    comuna: string | null
    telefono: string | null
    email: string | null
  }
  ejecutados: Ejecutado[]
}

export default function DemandaDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [demanda, setDemanda] = useState<Demanda | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'diligencias' | 'documentos' | 'notas'>('info')

  useEffect(() => {
    if (params.id) {
      fetchDemanda(params.id as string)
    }
  }, [params.id])

  const fetchDemanda = async (id: string) => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/roles/${id}`)
      const result = await response.json()

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Error al cargar la demanda')
      }

      setDemanda(result.data)
    } catch (err: any) {
      console.error('Error fetching demanda:', err)
      setError(err.message || 'Error al cargar la demanda')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Topbar />
        <main className="pt-20 pb-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <p className="text-gray-600">Cargando demanda...</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !demanda) {
    return (
      <div className="min-h-screen bg-white">
        <Topbar />
        <main className="pt-20 pb-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-red-800 mb-2">
                Error al cargar la demanda
              </h2>
              <p className="text-red-600 mb-4">{error || 'Demanda no encontrada'}</p>
              <div className="flex gap-4">
                <button
                  onClick={() => router.push('/roles')}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Volver a Gestión de Demandas
                </button>
                <button
                  onClick={() => fetchDemanda(params.id as string)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <Link
              href="/roles"
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2 mb-4"
            >
              ← Volver a Gestión de Demandas
            </Link>
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">
              Demanda: {demanda.rol}
            </h1>
            <p className="text-gray-600">{demanda.caratula}</p>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('info')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'info'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Información
              </button>
              <button
                onClick={() => setActiveTab('diligencias')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'diligencias'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Diligencias
              </button>
              <button
                onClick={() => setActiveTab('documentos')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'documentos'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Documentos
              </button>
              <button
                onClick={() => setActiveTab('notas')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'notas'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Notas
              </button>
            </nav>
          </div>

          {/* Tab content */}
          {activeTab === 'info' && (
            <div className="space-y-6">
              {/* Demanda Info Card */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Información de la Demanda
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">ROL</label>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{demanda.rol}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Carátula</label>
                    <p className="text-lg text-gray-900 mt-1">{demanda.caratula}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Cuantía</label>
                    <p className="text-lg text-gray-900 mt-1">{formatCurrency(demanda.cuantia)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Fecha de Creación</label>
                    <p className="text-lg text-gray-900 mt-1">{formatDate(demanda.createdAt)}</p>
                  </div>
                </div>
              </div>

              {/* Tribunal Card */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Tribunal</h2>
                <div className="space-y-2">
                  <p className="text-lg text-gray-900">{demanda.tribunal.nombre}</p>
                  {demanda.tribunal.direccion && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Dirección:</span> {demanda.tribunal.direccion}
                    </p>
                  )}
                  {demanda.tribunal.comuna && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Comuna:</span> {demanda.tribunal.comuna}
                    </p>
                  )}
                </div>
              </div>

              {/* Abogado Card */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Abogado</h2>
                <div className="space-y-2">
                  <p className="text-lg text-gray-900">{demanda.abogado.nombre || '-'}</p>
                  {demanda.abogado.rut && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">RUT:</span> {demanda.abogado.rut}
                    </p>
                  )}
                  {demanda.abogado.direccion && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Dirección:</span> {demanda.abogado.direccion}
                    </p>
                  )}
                  {demanda.abogado.comuna && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Comuna:</span> {demanda.abogado.comuna}
                    </p>
                  )}
                  {demanda.abogado.telefono && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Teléfono:</span> {demanda.abogado.telefono}
                    </p>
                  )}
                  {demanda.abogado.email && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Email:</span> {demanda.abogado.email}
                    </p>
                  )}
                </div>
              </div>

              {/* Ejecutados Card */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Ejecutados ({demanda.ejecutados.length})
                </h2>
                {demanda.ejecutados.length === 0 ? (
                  <p className="text-gray-500">No hay ejecutados registrados</p>
                ) : (
                  <div className="space-y-4">
                    {demanda.ejecutados.map((ejecutado) => (
                      <div
                        key={ejecutado.id}
                        className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-sm font-medium text-gray-500">Nombre</label>
                            <p className="text-base text-gray-900 mt-1">{ejecutado.nombre}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-500">RUT</label>
                            <p className="text-base text-gray-900 mt-1">{ejecutado.rut}</p>
                          </div>
                          {ejecutado.direccion && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">Dirección</label>
                              <p className="text-base text-gray-900 mt-1">{ejecutado.direccion}</p>
                            </div>
                          )}
                          {ejecutado.comuna && (
                            <div>
                              <label className="text-sm font-medium text-gray-500">Comuna</label>
                              <p className="text-base text-gray-900 mt-1">
                                {ejecutado.comuna.nombre}
                                {ejecutado.comuna.region && `, ${ejecutado.comuna.region}`}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Placeholder tabs */}
          {activeTab === 'diligencias' && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-gray-600 text-lg">Diligencias</p>
                <p className="text-gray-500 text-sm mt-2">
                  Esta funcionalidad estará disponible próximamente
                </p>
              </div>
            </div>
          )}

          {activeTab === 'documentos' && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📄</div>
                <p className="text-gray-600 text-lg">Documentos</p>
                <p className="text-gray-500 text-sm mt-2">
                  Esta funcionalidad estará disponible próximamente
                </p>
              </div>
            </div>
          )}

          {activeTab === 'notas' && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📝</div>
                <p className="text-gray-600 text-lg">Notas</p>
                <p className="text-gray-500 text-sm mt-2">
                  Esta funcionalidad estará disponible próximamente
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

