// Gestionar Materias page
// Functional page for managing materias (legal subjects)
'use client'

import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface Materia {
  id: number
  nombre: string
  createdAt: string
}

export default function MateriasPage() {
  const [materias, setMaterias] = useState<Materia[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingMateria, setEditingMateria] = useState<Materia | null>(null)
  const [formData, setFormData] = useState({ nombre: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchMaterias()
  }, [])

  const fetchMaterias = async () => {
    try {
      const response = await fetch('/api/materias')
      const result = await response.json()
      if (result.ok) {
        setMaterias(result.data)
      }
    } catch (error) {
      console.error('Error fetching materias:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (materia?: Materia) => {
    if (materia) {
      setEditingMateria(materia)
      setFormData({ nombre: materia.nombre })
    } else {
      setEditingMateria(null)
      setFormData({ nombre: '' })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingMateria(null)
    setFormData({ nombre: '' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const url = editingMateria
        ? `/api/materias/${editingMateria.id}`
        : '/api/materias'
      const method = editingMateria ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (result.ok) {
        await fetchMaterias()
        handleCloseModal()
      } else {
        alert('Error: ' + (result.error || 'Error al guardar'))
      }
    } catch (error) {
      console.error('Error saving materia:', error)
      alert('Error al guardar la materia')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta materia?')) {
      return
    }

    try {
      const response = await fetch(`/api/materias/${id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.ok) {
        await fetchMaterias()
      } else {
        alert('Error: ' + (result.error || 'Error al eliminar'))
      }
    } catch (error) {
      console.error('Error deleting materia:', error)
      alert('Error al eliminar la materia')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                Gestionar Materias
              </h1>
              <p className="text-gray-600">
                Administra las materias legales de tu oficina
              </p>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Agregar
            </button>
          </div>

          {/* Table or empty state */}
          {loading ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <p className="text-gray-600">Cargando...</p>
              </div>
            </div>
          ) : materias.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📚</div>
                <p className="text-gray-600 text-lg">
                  No hay registros aún.
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Haz clic en "Agregar" para crear tu primera materia.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nombre
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fecha de Creación
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {materias.map((materia) => (
                      <tr key={materia.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {materia.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {materia.nombre}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(materia.createdAt).toLocaleDateString('es-CL')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleOpenModal(materia)}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(materia.id)}
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
            </div>
          )}

          {/* Modal */}
          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="p-6">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                    {editingMateria ? 'Editar Materia' : 'Nueva Materia'}
                  </h2>
                  <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nombre *
                      </label>
                      <input
                        type="text"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ nombre: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                        minLength={2}
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                        disabled={submitting}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        disabled={submitting}
                      >
                        {submitting ? 'Guardando...' : editingMateria ? 'Actualizar' : 'Crear'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Back links */}
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
