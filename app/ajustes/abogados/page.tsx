// Gestionar Abogados page
'use client'

import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface Banco {
  id: number
  nombre: string
}

interface Abogado {
  id: number
  nombre?: string
  rut?: string
  direccion?: string
  comuna?: string
  telefono?: string
  email?: string
  bancoId?: number
  banco?: { nombre: string }
  createdAt: string
}

export default function AbogadosPage() {
  const [abogados, setAbogados] = useState<Abogado[]>([])
  const [bancos, setBancos] = useState<Banco[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingAbogado, setEditingAbogado] = useState<Abogado | null>(null)
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
      const response = await fetch('/api/abogados')
      const result = await response.json()
      if (result.ok) {
        setAbogados(result.data)
      }
    } catch (error) {
      console.error('Error fetching abogados:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchBancos = async () => {
    try {
      const response = await fetch('/api/bancos')
      const result = await response.json()
      if (result.ok) {
        setBancos(result.data)
      }
    } catch (error) {
      console.error('Error fetching bancos:', error)
    }
  }

  const handleOpenModal = (abogado?: Abogado) => {
    if (abogado) {
      setEditingAbogado(abogado)
      setFormData({
        nombre: abogado.nombre || '',
        rut: abogado.rut || '',
        direccion: abogado.direccion || '',
        comuna: abogado.comuna || '',
        telefono: abogado.telefono || '',
        email: abogado.email || '',
        bancoId: abogado.bancoId?.toString() || '',
      })
    } else {
      setEditingAbogado(null)
      setFormData({
        nombre: '',
        rut: '',
        direccion: '',
        comuna: '',
        telefono: '',
        email: '',
        bancoId: '',
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingAbogado(null)
    setFormData({
      nombre: '',
      rut: '',
      direccion: '',
      comuna: '',
      telefono: '',
      email: '',
      bancoId: '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const url = editingAbogado ? `/api/abogados/${editingAbogado.id}` : '/api/abogados'
      const method = editingAbogado ? 'PUT' : 'POST'

      const payload: any = {
        nombre: formData.nombre || undefined,
        rut: formData.rut || undefined,
        direccion: formData.direccion || undefined,
        comuna: formData.comuna || undefined,
        telefono: formData.telefono || undefined,
        email: formData.email || undefined,
      }

      if (formData.bancoId) {
        payload.bancoId = parseInt(formData.bancoId)
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (result.ok) {
        await fetchAbogados()
        handleCloseModal()
      } else {
        alert('Error: ' + (result.error || 'Error al guardar'))
      }
    } catch (error) {
      console.error('Error saving abogado:', error)
      alert('Error al guardar el abogado')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este abogado?')) return

    try {
      const response = await fetch(`/api/abogados/${id}`, { method: 'DELETE' })
      const result = await response.json()

      if (result.ok) {
        await fetchAbogados()
      } else {
        alert('Error: ' + (result.error || 'Error al eliminar'))
      }
    } catch (error) {
      console.error('Error deleting abogado:', error)
      alert('Error al eliminar el abogado')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">Gestionar Abogados</h1>
              <p className="text-gray-600">Administra los abogados asociados a tu oficina</p>
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
          ) : abogados.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">👨‍⚖️</div>
                <p className="text-gray-600 text-lg">No hay registros aún.</p>
                <p className="text-gray-500 text-sm mt-2">Haz clic en "Agregar" para crear tu primer abogado.</p>
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">RUT</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Banco</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {abogados.map((abogado) => (
                      <tr key={abogado.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{abogado.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{abogado.nombre || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{abogado.rut || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{abogado.email || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{abogado.banco?.nombre || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button onClick={() => handleOpenModal(abogado)} className="text-blue-600 hover:text-blue-900 mr-4">Editar</button>
                          <button onClick={() => handleDelete(abogado.id)} className="text-red-600 hover:text-red-900">Eliminar</button>
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
              <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-4">{editingAbogado ? 'Editar Abogado' : 'Nuevo Abogado'}</h2>
                  <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Nombre</label>
                        <input
                          type="text"
                          value={formData.nombre}
                          onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">RUT</label>
                        <input
                          type="text"
                          value={formData.rut}
                          onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Teléfono</label>
                        <input
                          type="text"
                          value={formData.telefono}
                          onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Dirección</label>
                        <input
                          type="text"
                          value={formData.direccion}
                          onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Comuna</label>
                        <input
                          type="text"
                          value={formData.comuna}
                          onChange={(e) => setFormData({ ...formData, comuna: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Banco</label>
                        <select
                          value={formData.bancoId}
                          onChange={(e) => setFormData({ ...formData, bancoId: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={handleCloseModal} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors" disabled={submitting}>Cancelar</button>
                      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50" disabled={submitting}>
                        {submitting ? 'Guardando...' : editingAbogado ? 'Actualizar' : 'Crear'}
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
