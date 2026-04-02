// Gestionar Abogados page
// Full CRUD functionality for abogados
'use client'

import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface Procurador {
  id: number
  nombre: string
}

interface NewProcuradorForm {
  nombre: string
  email: string
  telefono: string
  notas: string
}

interface Abogado {
  id: number
  nombre: string | null
  rut: string | null
  direccion: string | null
  comuna: string | null
  telefono: string | null
  email: string | null
  bancos?: Array<{
    banco: {
      id: number
      nombre: string
    }
  }>
  procuradores?: Procurador[]
  createdAt: string
}

interface Banco {
  id: number
  nombre: string
}

const emptyNewProcurador = (): NewProcuradorForm => ({
  nombre: '',
  email: '',
  telefono: '',
  notas: '',
})

const initialFormData = {
  nombre: '',
  telefono: '',
  email: '',
  bancoIds: [] as number[],
  procuradorIds: [] as number[],
  newProcuradores: [] as NewProcuradorForm[],
}

export default function AbogadosPage() {
  const [abogados, setAbogados] = useState<Abogado[]>([])
  const [bancos, setBancos] = useState<Banco[]>([])
  const [procuradores, setProcuradores] = useState<Procurador[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [editingAbogado, setEditingAbogado] = useState<Abogado | null>(null)

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredAbogados = abogados.filter((abogado) => {
    if (!normalizedSearchTerm) return true
    return (abogado.nombre || '').toLowerCase().includes(normalizedSearchTerm)
  })

  useEffect(() => {
    fetchAbogados()
    fetchBancos()
    fetchProcuradores()
  }, [])

  const resetForm = () => {
    setFormData(initialFormData)
    setEditingAbogado(null)
    setError(null)
  }

  const closeModal = () => {
    setShowModal(false)
    resetForm()
  }

  const openCreateModal = () => {
    resetForm()
    setShowModal(true)
  }

  const openEditModal = (abogado: Abogado) => {
    setEditingAbogado(abogado)
    setFormData({
      nombre: abogado.nombre || '',
      telefono: abogado.telefono || '',
      email: abogado.email || '',
      bancoIds: (abogado.bancos || []).map((item) => item.banco.id),
      procuradorIds: (abogado.procuradores || []).map((procurador) => procurador.id),
      newProcuradores: [],
    })
    setError(null)
    setShowModal(true)
  }

  const fetchAbogados = async () => {
    try {
      const response = await fetch('/api/abogados', {
        credentials: 'include',
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
        return
      }

      setBancos(data.data || [])
    } catch (err) {
      console.error('Error loading bancos:', err)
    }
  }

  const fetchProcuradores = async () => {
    try {
      const response = await fetch('/api/procuradores', {
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        return
      }

      setProcuradores(data.data || [])
    } catch (err) {
      console.error('Error loading procuradores:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const cleanedNewProcuradores = formData.newProcuradores
        .map((procurador) => ({
          nombre: procurador.nombre.trim(),
          email: procurador.email.trim(),
          telefono: procurador.telefono.trim(),
          notas: procurador.notas.trim(),
        }))
        .filter((procurador) => procurador.nombre.length > 0)
        .map((procurador) => ({
          nombre: procurador.nombre,
          email: procurador.email || null,
          telefono: procurador.telefono || null,
          notas: procurador.notas || null,
        }))

      const payload: {
        nombre: string
        telefono?: string
        email?: string
        bancoIds?: number[]
        procuradorIds?: number[]
        newProcuradores?: Array<{
          nombre: string
          email: string | null
          telefono: string | null
          notas: string | null
        }>
      } = { nombre: formData.nombre.trim() }

      if (formData.telefono.trim()) payload.telefono = formData.telefono.trim()
      if (formData.email.trim()) payload.email = formData.email.trim()
      if (formData.bancoIds.length > 0) payload.bancoIds = formData.bancoIds
      if (formData.procuradorIds.length > 0) payload.procuradorIds = formData.procuradorIds
      if (cleanedNewProcuradores.length > 0) payload.newProcuradores = cleanedNewProcuradores

      const response = await fetch(editingAbogado ? `/api/abogados/${editingAbogado.id}` : '/api/abogados', {
        method: editingAbogado ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        const errorMessage = data.message || data.error || 'Error al crear el abogado'
        throw new Error(errorMessage)
      }

      await fetchAbogados()
      closeModal()
      await fetchProcuradores()
      setSuccess(editingAbogado ? 'Abogado actualizado exitosamente' : 'Abogado creado exitosamente')
    } catch (err) {
      setSuccess(null)
      setError(err instanceof Error ? err.message : editingAbogado ? 'Error al actualizar el abogado' : 'Error al crear el abogado')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este abogado?')) {
      return
    }

    const previousAbogados = abogados
    setAbogados((prev) => prev.filter((a) => a.id !== id))

    try {
      const response = await fetch(`/api/abogados/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        setAbogados(previousAbogados)
        const errorMessage = data.message || data.error || 'Error al eliminar el abogado'
        setSuccess(null)
        setError(errorMessage)
        return
      }

      setSuccess('Abogado eliminado correctamente')
      setError(null)
    } catch (err) {
      setAbogados(previousAbogados)
      setSuccess(null)
      setError(err instanceof Error ? err.message : 'Error al eliminar el abogado')
    }
  }

  const toggleBanco = (bancoId: number, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      bancoIds: checked
        ? [...prev.bancoIds, bancoId]
        : prev.bancoIds.filter((id) => id !== bancoId),
    }))
  }

  const toggleProcurador = (procuradorId: number, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      procuradorIds: checked
        ? [...prev.procuradorIds, procuradorId]
        : prev.procuradorIds.filter((id) => id !== procuradorId),
    }))
  }

  const addNewProcuradorRow = () => {
    setFormData((prev) => ({
      ...prev,
      newProcuradores: [...prev.newProcuradores, emptyNewProcurador()],
    }))
  }

  const updateNewProcurador = (
    index: number,
    field: keyof NewProcuradorForm,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      newProcuradores: prev.newProcuradores.map((procurador, procuradorIndex) =>
        procuradorIndex === index ? { ...procurador, [field]: value } : procurador
      ),
    }))
  }

  const removeNewProcurador = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      newProcuradores: prev.newProcuradores.filter((_, procuradorIndex) => procuradorIndex !== index),
    }))
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
              onClick={openCreateModal}
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

          {!loading && abogados.length > 0 && (
            <div className="mb-6">
              <label htmlFor="buscar-abogados" className="block text-sm font-medium text-gray-700 mb-2">
                Buscar abogados
              </label>
              <input
                id="buscar-abogados"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Escribe un nombre para filtrar..."
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
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
                  Haz clic en &quot;Agregar&quot; para crear tu primer abogado.
                </p>
              </div>
            </div>
          ) : filteredAbogados.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <p className="text-gray-600 text-lg">
                  No se encontraron abogados para esta búsqueda.
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Intenta con otro nombre o borra el texto para ver todos los abogados.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Procuradores</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Banco</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAbogados.map((abogado) => (
                    <tr key={abogado.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {abogado.nombre || 'Sin nombre'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{abogado.email || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {abogado.procuradores && abogado.procuradores.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {abogado.procuradores.map((procurador) => (
                              <span
                                key={procurador.id}
                                className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                              >
                                {procurador.nombre}
                              </span>
                            ))}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {abogado.bancos && abogado.bancos.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {abogado.bancos.slice(0, 2).map((item) => (
                              <span
                                key={`${abogado.id}-${item.banco.id}`}
                                className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                              >
                                {item.banco.nombre}
                              </span>
                            ))}
                            {abogado.bancos.length > 2 && (
                              <span
                                className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                                title={`${abogado.bancos.length} bancos asignados`}
                              >
                                (+{abogado.bancos.length - 2})
                              </span>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <button
                          onClick={() => openEditModal(abogado)}
                          className="mr-4 text-blue-600 hover:text-blue-900"
                        >
                          Editar
                        </button>
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
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  {editingAbogado ? 'Editar Abogado' : 'Agregar Nuevo Abogado'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre
                    </label>
                    <input
                      type="text"
                      value={formData.nombre}
                      onChange={(e) => setFormData((prev) => ({ ...prev, nombre: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
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
                        onChange={(e) => setFormData((prev) => ({ ...prev, telefono: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Bancos
                      </label>
                      <span className="text-xs text-gray-500">Opcional</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-3 space-y-2">
                      {bancos.length === 0 ? (
                        <p className="text-sm text-gray-500">No hay bancos disponibles</p>
                      ) : (
                        bancos.map((banco) => (
                          <label key={banco.id} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                            <input
                              type="checkbox"
                              checked={formData.bancoIds.includes(banco.id)}
                              onChange={(e) => toggleBanco(banco.id, e.target.checked)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{banco.nombre}</span>
                          </label>
                        ))
                      )}
                    </div>
                    {formData.bancoIds.length > 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        {formData.bancoIds.length} banco(s) seleccionado(s)
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Procuradores existentes
                      </label>
                      <span className="text-xs text-gray-500">Opcional</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-3 space-y-2">
                      {procuradores.length === 0 ? (
                        <p className="text-sm text-gray-500">No hay procuradores disponibles</p>
                      ) : (
                        procuradores.map((procurador) => (
                          <label key={procurador.id} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                            <input
                              type="checkbox"
                              checked={formData.procuradorIds.includes(procurador.id)}
                              onChange={(e) => toggleProcurador(procurador.id, e.target.checked)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{procurador.nombre}</span>
                          </label>
                        ))
                      )}
                    </div>
                    {formData.procuradorIds.length > 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        {formData.procuradorIds.length} procurador(es) seleccionado(s)
                      </p>
                    )}
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">Agregar nuevo procurador</h3>
                        <p className="text-xs text-gray-500">
                          Si no existe en la lista, puedes crearlo aquí mismo.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addNewProcuradorRow}
                        className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                      >
                        + Agregar procurador
                      </button>
                    </div>

                    {formData.newProcuradores.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No hay nuevos procuradores agregados.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {formData.newProcuradores.map((procurador, index) => (
                          <div key={index} className="rounded-lg border border-gray-200 p-4 space-y-4 bg-slate-50">
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-sm font-medium text-gray-900">
                                Nuevo procurador {index + 1}
                              </h4>
                              <button
                                type="button"
                                onClick={() => removeNewProcurador(index)}
                                className="text-sm text-red-600 hover:text-red-700"
                              >
                                Eliminar
                              </button>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Nombre
                              </label>
                              <input
                                type="text"
                                value={procurador.nombre}
                                onChange={(e) => updateNewProcurador(index, 'nombre', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Email
                                </label>
                                <input
                                  type="email"
                                  value={procurador.email}
                                  onChange={(e) => updateNewProcurador(index, 'email', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Teléfono
                                </label>
                                <input
                                  type="tel"
                                  value={procurador.telefono}
                                  onChange={(e) => updateNewProcurador(index, 'telefono', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Notas
                              </label>
                              <textarea
                                value={procurador.notas}
                                onChange={(e) => updateNewProcurador(index, 'notas', e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                    >
                      {submitting ? 'Guardando...' : editingAbogado ? 'Guardar cambios' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={closeModal}
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
