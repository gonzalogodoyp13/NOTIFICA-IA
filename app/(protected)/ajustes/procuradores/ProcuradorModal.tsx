// Modal para crear/editar Procurador
'use client'

import { useEffect, useState } from 'react'

interface Abogado {
  id: number
  nombre: string | null
}

interface Procurador {
  id: number
  nombre: string
  email: string | null
  telefono: string | null
  notas: string | null
  abogadoId: number | null
  abogado: Abogado | null
  activo: boolean
  bancoProcurador: { activo: boolean; alias: string | null } | null
  createdAt: string
  updatedAt: string
}

interface ProcuradorModalProps {
  isOpen: boolean
  onClose: () => void
  bancoId: number | null
  procurador?: Procurador
  onSuccess: () => void
}

export function ProcuradorModal({ isOpen, onClose, bancoId, procurador, onSuccess }: ProcuradorModalProps) {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    notas: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (procurador) {
      setFormData({
        nombre: procurador.nombre || '',
        email: procurador.email || '',
        telefono: procurador.telefono || '',
        notas: procurador.notas || '',
      })
    } else {
      setFormData({
        nombre: '',
        email: '',
        telefono: '',
        notas: '',
      })
    }
    setError(null)
  }, [procurador, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    if (!formData.nombre.trim()) {
      setError('El nombre es requerido')
      setSubmitting(false)
      return
    }

    try {
      // Normalize empty email to null
      const emailValue = formData.email.trim() || null
      const telefonoValue = formData.telefono.trim() || null
      const notasValue = formData.notas.trim() || null

      if (procurador) {
        // Edit mode: PATCH
        const response = await fetch(`/api/procuradores/${procurador.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: formData.nombre.trim(),
            email: emailValue,
            telefono: telefonoValue,
            notas: notasValue,
          }),
          credentials: 'include',
        })

        const data = await response.json()
        if (!data.ok) {
          throw new Error(data.message || data.error || 'Error al actualizar el procurador')
        }
      } else {
        // Create mode: POST
        if (!bancoId) {
          throw new Error('Banco no seleccionado')
        }

        const response = await fetch('/api/procuradores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: formData.nombre.trim(),
            email: emailValue,
            telefono: telefonoValue,
            notas: notasValue,
            bancoId,
          }),
          credentials: 'include',
        })

        const data = await response.json()
        if (!data.ok) {
          throw new Error(data.message || data.error || 'Error al crear el procurador')
        }
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {procurador ? 'Editar Procurador' : 'Agregar Nuevo Procurador'}
        </h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              required
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
              Notas
            </label>
            <textarea
              value={formData.notas}
              onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
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
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

