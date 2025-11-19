// Gestionar Comunas page
// Full CRUD functionality for comunas
'use client'

import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface Comuna {
  id: number
  nombre: string
  region: string | null
  createdAt: string
}

export default function ComunasPage() {
  const [comunas, setComunas] = useState<Comuna[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    region: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchComunas()
  }, [])

  const fetchComunas = async () => {
    try {
      const response = await fetch('/api/comunas', {
        credentials: 'include', // Ensure cookies are sent
      })
      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        const errorMessage = data.message || data.error || 'Error al cargar las comunas'
        setError(errorMessage)
        setLoading(false)
        return
      }

      setComunas(data.data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const payload: any = { nombre: formData.nombre }
      if (formData.region) payload.region = formData.region

      const response = await fetch('/api/comunas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        const errorMessage = data.message || data.error || 'Error al crear la comuna'
        throw new Error(errorMessage)
      }

      // Actualización optimista
      if (data.data) {
        setComunas(prev => [data.data, ...prev])
      }
      setShowModal(false)
      setFormData({ nombre: '', region: '' })
      setSuccess('Comuna creada exitosamente')
    } catch (err) {
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'Error al crear la comuna')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta comuna?')) {
      return
    }

    const previousComunas = comunas

    // Actualización optimista ANTES del fetch
    setComunas(prev => prev.filter(c => c.id !== id))

    try {
      const response = await fetch(`/api/comunas/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        // Revertir si falla
        setComunas(previousComunas)
        const errorMessage = data.message || data.error || 'Error al eliminar la comuna'
        setSuccess(null)
        setError(errorMessage)
        return
      }

      setSuccess('Comuna eliminada correctamente')
      setError(null)
    } catch (err) {
      // Revertir si hay error de red
      setComunas(previousComunas)
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'Error al eliminar la comuna')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                Gestionar Comunas
              </h1>
              <p className="text-gray-600">
                Administra las comunas disponibles en el sistema
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Agregar
            </button>
          </div>

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800">{success}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <p className="text-gray-600">Cargando comunas...</p>
              </div>
            </div>
          ) : comunas.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">🗺️</div>
                <p className="text-gray-600 text-lg">
                  No hay comunas registradas aún.
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Haz clic en "Agregar" para crear tu primera comuna.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Región</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {comunas.map((comuna) => (
                    <tr key={comuna.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {comuna.nombre}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{comuna.region || '-'}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <button
                          onClick={() => handleDelete(comuna.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Agregar Nueva Comuna
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej: Santiago, Valparaíso..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Región
                    </label>
                    <input
                      type="text"
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej: Región Metropolitana"
                    />
                  </div>
                  <div className="flex items-center gap-4 pt-4">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                    >
                      {submitting ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false)
                        setFormData({ nombre: '', region: '' })
                        setError(null)
                      }}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

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
    </div>
  )
}
