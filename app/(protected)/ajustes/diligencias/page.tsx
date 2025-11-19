// Gestionar Diligencias page
// Full CRUD functionality for diligencia tipos
'use client'

import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface DiligenciaTipo {
  id: string
  nombre: string
  descripcion: string | null
  createdAt: string
}

export default function DiligenciasPage() {
  const [diligencias, setDiligencias] = useState<DiligenciaTipo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchDiligencias()
  }, [])

  const fetchDiligencias = async () => {
    try {
      const response = await fetch('/api/diligencia-tipos', {
        credentials: 'include', // Ensure cookies are sent
      })
      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        const errorMessage = data.message || data.error || 'Error al cargar los tipos de diligencias'
        setError(errorMessage)
        setLoading(false)
        return
      }

      setDiligencias(data.data || [])
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
      if (formData.descripcion) payload.descripcion = formData.descripcion

      const response = await fetch('/api/diligencia-tipos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        const errorMessage = data.message || data.error || 'Error al crear el tipo de diligencia'
        throw new Error(errorMessage)
      }

      // Actualización optimista
      if (data.data) {
        setDiligencias(prev => [data.data, ...prev])
      }
      setShowModal(false)
      setFormData({ nombre: '', descripcion: '' })
      setSuccess('Tipo de diligencia creado exitosamente')
    } catch (err) {
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'Error al crear el tipo de diligencia')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este tipo de diligencia?')) {
      return
    }

    const previousDiligencias = diligencias

    // Actualización optimista ANTES del fetch
    setDiligencias(prev => prev.filter(d => d.id !== id))

    try {
      const response = await fetch(`/api/diligencia-tipos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        // Revertir si falla
        setDiligencias(previousDiligencias)
        const errorMessage = data.message || data.error || 'Error al eliminar el tipo de diligencia'
        setSuccess(null)
        setError(errorMessage)
        return
      }

      setSuccess('Tipo de diligencia eliminado correctamente')
      setError(null)
    } catch (err) {
      // Revertir si hay error de red
      setDiligencias(previousDiligencias)
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'Error al eliminar el tipo de diligencia')
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
                Gestionar Tipos de Diligencias
              </h1>
              <p className="text-gray-600">
                Configura los tipos de diligencias disponibles
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
                <p className="text-gray-600">Cargando tipos de diligencias...</p>
              </div>
            </div>
          ) : diligencias.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-gray-600 text-lg">
                  No hay tipos de diligencias registrados aún.
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Haz clic en "Agregar" para crear tu primer tipo de diligencia.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {diligencias.map((diligencia) => (
                    <tr key={diligencia.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {diligencia.nombre}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{diligencia.descripcion || '-'}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <button
                          onClick={() => handleDelete(diligencia.id)}
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
                  Agregar Nuevo Tipo de Diligencia
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
                      placeholder="Ej: Notificación, Embargo..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descripción
                    </label>
                    <textarea
                      value={formData.descripcion}
                      onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                      placeholder="Descripción del tipo de diligencia (opcional)"
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
                        setFormData({ nombre: '', descripcion: '' })
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
