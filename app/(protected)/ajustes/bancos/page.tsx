// Gestionar Bancos page
// Full CRUD functionality for bancos
'use client'

import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface Banco {
  id: number
  nombre: string
  cuenta: string | null
  createdAt: string
}

export default function BancosPage() {
  const [bancos, setBancos] = useState<Banco[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    cuenta: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchBancos()
  }, [])

  const fetchBancos = async () => {
    try {
      const response = await fetch('/api/bancos', {
        credentials: 'include', // Ensure cookies are sent
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Error al cargar los bancos')
      }

      if (data.ok) {
        setBancos(data.data || [])
        setError(null)
      } else {
        setError(data.error || 'Error al cargar los bancos')
      }
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
      if (formData.cuenta) payload.cuenta = formData.cuenta

      const response = await fetch('/api/bancos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.ok) {
        const errorMessage = Array.isArray(data.error)
          ? data.error.map((e: any) => e.message || JSON.stringify(e)).join(', ')
          : (data.error || 'Error al crear el banco')
        throw new Error(errorMessage)
      }

      setShowModal(false)
      setFormData({ nombre: '', cuenta: '' })
      setSuccess('Banco creado exitosamente')
      fetchBancos()
    } catch (err) {
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'Error al crear el banco')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este banco?')) {
      return
    }

    try {
      const response = await fetch(`/api/bancos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Error al eliminar el banco')
      }

      fetchBancos()
      setSuccess('Banco eliminado correctamente')
      setError(null)
    } catch (err) {
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'Error al eliminar el banco')
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
                Gestionar Bancos
              </h1>
              <p className="text-gray-600">
                Configura los bancos disponibles en el sistema
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
                <p className="text-gray-600">Cargando bancos...</p>
              </div>
            </div>
          ) : bancos.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">🏦</div>
                <p className="text-gray-600 text-lg">
                  No hay bancos registrados aún.
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Haz clic en "Agregar" para crear tu primer banco.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cuenta</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bancos.map((banco) => (
                    <tr key={banco.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {banco.nombre}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{banco.cuenta || '-'}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <button
                          onClick={() => handleDelete(banco.id)}
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
                  Agregar Nuevo Banco
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
                      placeholder="Ej: Banco de Chile, Banco Estado..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cuenta
                    </label>
                    <input
                      type="text"
                      value={formData.cuenta}
                      onChange={(e) => setFormData({ ...formData, cuenta: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Número de cuenta (opcional)"
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
                        setFormData({ nombre: '', cuenta: '' })
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
