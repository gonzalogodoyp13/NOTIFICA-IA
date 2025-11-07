// Gestionar Diligencias page
'use client'

import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface Diligencia {
  id: number
  nombre: string
  descripcion?: string
  createdAt: string
}

export default function DiligenciasPage() {
  const [diligencias, setDiligencias] = useState<Diligencia[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingDiligencia, setEditingDiligencia] = useState<Diligencia | null>(null)
  const [formData, setFormData] = useState({ nombre: '', descripcion: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchDiligencias()
  }, [])

  const fetchDiligencias = async () => {
    try {
      const response = await fetch('/api/diligencias')
      const result = await response.json()
      if (result.ok) {
        setDiligencias(result.data)
      }
    } catch (error) {
      console.error('Error fetching diligencias:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (diligencia?: Diligencia) => {
    if (diligencia) {
      setEditingDiligencia(diligencia)
      setFormData({ nombre: diligencia.nombre, descripcion: diligencia.descripcion || '' })
    } else {
      setEditingDiligencia(null)
      setFormData({ nombre: '', descripcion: '' })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingDiligencia(null)
    setFormData({ nombre: '', descripcion: '' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const url = editingDiligencia ? `/api/diligencias/${editingDiligencia.id}` : '/api/diligencias'
      const method = editingDiligencia ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          descripcion: formData.descripcion || undefined,
        }),
      })

      const result = await response.json()

      if (result.ok) {
        await fetchDiligencias()
        handleCloseModal()
      } else {
        alert('Error: ' + (result.error || 'Error al guardar'))
      }
    } catch (error) {
      console.error('Error saving diligencia:', error)
      alert('Error al guardar la diligencia')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta diligencia?')) return

    try {
      const response = await fetch(`/api/diligencias/${id}`, { method: 'DELETE' })
      const result = await response.json()

      if (result.ok) {
        await fetchDiligencias()
      } else {
        alert('Error: ' + (result.error || 'Error al eliminar'))
      }
    } catch (error) {
      console.error('Error deleting diligencia:', error)
      alert('Error al eliminar la diligencia')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">Gestionar Diligencias</h1>
              <p className="text-gray-600">Configura los tipos de diligencias</p>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Agregar
            </button>
          </div>

          {loading ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12"><p className="text-gray-600">Cargando...</p></div>
            </div>
          ) : diligencias.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-gray-600 text-lg">No hay registros aún.</p>
                <p className="text-gray-500 text-sm mt-2">Haz clic en "Agregar" para crear tu primera diligencia.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {diligencias.map((diligencia) => (
                      <tr key={diligencia.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{diligencia.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{diligencia.nombre}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{diligencia.descripcion || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button onClick={() => handleOpenModal(diligencia)} className="text-blue-600 hover:text-blue-900 mr-4">Editar</button>
                          <button onClick={() => handleDelete(diligencia.id)} className="text-red-600 hover:text-red-900">Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="p-6">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-4">{editingDiligencia ? 'Editar Diligencia' : 'Nueva Diligencia'}</h2>
                  <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Nombre *</label>
                      <input
                        type="text"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                        minLength={2}
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
                      <textarea
                        value={formData.descripcion}
                        onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={handleCloseModal} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors" disabled={submitting}>Cancelar</button>
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50" disabled={submitting}>
                        {submitting ? 'Guardando...' : editingDiligencia ? 'Actualizar' : 'Crear'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center gap-4 flex-wrap">
            <Link href="/ajustes" className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2">← Volver a Ajustes</Link>
            <span className="text-gray-400">•</span>
            <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2">← Volver al Dashboard</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
