// Gestionar Abogados page
// Full CRUD functionality for abogados
'use client'

import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface Abogado {
  id: number
  nombre: string | null
  rut: string | null
  direccion: string | null
  comuna: string | null
  telefono: string | null
  email: string | null
  banco: {
    nombre: string
  } | null
  createdAt: string
}

interface Banco {
  id: number
  nombre: string
}

export default function AbogadosPage() {
  const [abogados, setAbogados] = useState<Abogado[]>([])
  const [bancos, setBancos] = useState<Banco[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    rut: '',
    direccion: '',
    comuna: '',
    telefono: '',
    email: '',
    bancoId: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAbogados()
    fetchBancos()
  }, [])

  const fetchAbogados = async () => {
    try {
      const response = await fetch('/api/abogados', {
        credentials: 'include', // Ensure cookies are sent
      })
      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        const errorMessage = data.message || data.error || 'Error al cargar los abogados'
        setError(errorMessage)
        setLoading(false)
        return
      }

      setAbogados(data.data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const fetchBancos = async () => {
    try {
      const response = await fetch('/api/bancos', {
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        // Silenciosamente fallar, no es crítico
        return
      }

      setBancos(data.data || [])
    } catch (err) {
      // Silenciosamente fallar, no es crítico
      console.error('Error loading bancos:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const payload: any = { nombre: formData.nombre }
      if (formData.rut) payload.rut = formData.rut
      if (formData.direccion) payload.direccion = formData.direccion
      if (formData.comuna) payload.comuna = formData.comuna
      if (formData.telefono) payload.telefono = formData.telefono
      if (formData.email) payload.email = formData.email
      if (formData.bancoId) payload.bancoId = parseInt(formData.bancoId)

      const response = await fetch('/api/abogados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        const errorMessage = data.message || data.error || 'Error al crear el abogado'
        throw new Error(errorMessage)
      }

      // Actualización optimista
      if (data.data) {
        setAbogados(prev => [data.data, ...prev])
      }
      setShowModal(false)
      setFormData({
        nombre: '',
        rut: '',
        direccion: '',
        comuna: '',
        telefono: '',
        email: '',
        bancoId: '',
      })
      setSuccess('Abogado creado exitosamente')
    } catch (err) {
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'Error al crear el abogado')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este abogado?')) {
      return
    }

    const previousAbogados = abogados

    // Actualización optimista ANTES del fetch
    setAbogados(prev => prev.filter(a => a.id !== id))

    try {
      const response = await fetch(`/api/abogados/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        // Revertir si falla
        setAbogados(previousAbogados)
        const errorMessage = data.message || data.error || 'Error al eliminar el abogado'
        setSuccess(null)
        setError(errorMessage)
        return
      }

      setSuccess('Abogado eliminado correctamente')
      setError(null)
    } catch (err) {
      // Revertir si hay error de red
      setAbogados(previousAbogados)
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'Error al eliminar el abogado')
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
                Gestionar Abogados
              </h1>
              <p className="text-gray-600">
                Administra los abogados asociados a tu oficina
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
                <p className="text-gray-600">Cargando abogados...</p>
              </div>
            </div>
          ) : abogados.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">👨‍⚖️</div>
                <p className="text-gray-600 text-lg">
                  No hay abogados registrados aún.
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Haz clic en "Agregar" para crear tu primer abogado.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">RUT</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Banco</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {abogados.map((abogado) => (
                    <tr key={abogado.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {abogado.nombre || 'Sin nombre'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{abogado.rut || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{abogado.email || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{abogado.banco?.nombre || '-'}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <button
                          onClick={() => handleDelete(abogado.id)}
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
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Agregar Nuevo Abogado
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nombre
                      </label>
                      <input
                        type="text"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        RUT
                      </label>
                      <input
                        type="text"
                        value={formData.rut}
                        onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        value={formData.telefono}
                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dirección
                      </label>
                      <input
                        type="text"
                        value={formData.direccion}
                        onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Comuna
                      </label>
                      <input
                        type="text"
                        value={formData.comuna}
                        onChange={(e) => setFormData({ ...formData, comuna: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Banco
                      </label>
                      <select
                        value={formData.bancoId}
                        onChange={(e) => setFormData({ ...formData, bancoId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Seleccionar banco (opcional)</option>
                        {bancos.map((banco) => (
                          <option key={banco.id} value={banco.id}>
                            {banco.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
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
                        setFormData({
                          nombre: '',
                          rut: '',
                          direccion: '',
                          comuna: '',
                          telefono: '',
                          email: '',
                          bancoId: '',
                        })
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
