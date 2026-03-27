// Modal para crear/editar Procurador
'use client'

import { useEffect, useState } from 'react'

interface Abogado {
  id: number
  nombre: string | null
}

interface Banco {
  id: number
  nombre: string
}

interface ProcuradorBanco {
  bancoId: number
  activo: boolean
  alias: string | null
  banco: {
    id: number
    nombre: string
  }
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
  bancos?: ProcuradorBanco[]
  bancoProcurador: { activo: boolean; alias: string | null } | null
  createdAt: string
  updatedAt: string
}

interface ProcuradorModalProps {
  isOpen: boolean
  onClose: () => void
  bancoId: number | null
  procurador?: Procurador
  bancos: Banco[]
  onSuccess: (result?: { reusedExisting?: boolean }) => void
}

const emptyFormData = {
  nombre: '',
  email: '',
  telefono: '',
  notas: '',
}

export function ProcuradorModal({
  isOpen,
  onClose,
  bancoId,
  procurador,
  bancos,
  onSuccess,
}: ProcuradorModalProps) {
  const [formData, setFormData] = useState(emptyFormData)
  const [selectedBancoIds, setSelectedBancoIds] = useState<number[]>([])
  const [bankSearchTerm, setBankSearchTerm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (procurador) {
      setFormData({
        nombre: procurador.nombre || '',
        email: procurador.email || '',
        telefono: procurador.telefono || '',
        notas: procurador.notas || '',
      })
      setSelectedBancoIds((procurador.bancos || []).map((banco) => banco.bancoId))
    } else {
      setFormData(emptyFormData)
      setSelectedBancoIds(bancoId ? [bancoId] : [])
    }
    setBankSearchTerm('')
    setError(null)
  }, [procurador, isOpen, bancoId])

  useEffect(() => {
    if (!isOpen || !procurador) return

    const abortController = new AbortController()

    const fetchProcuradorDetails = async () => {
      setLoadingDetails(true)

      try {
        const response = await fetch(`/api/procuradores/${procurador.id}`, {
          signal: abortController.signal,
          credentials: 'include',
        })
        const data = await response.json()

        if (!response.ok || !data.ok) {
          throw new Error(data.message || data.error || 'Error al cargar el procurador')
        }

        setFormData({
          nombre: data.data.nombre || '',
          email: data.data.email || '',
          telefono: data.data.telefono || '',
          notas: data.data.notas || '',
        })
        setSelectedBancoIds((data.data.bancos || []).map((banco: ProcuradorBanco) => banco.bancoId))
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Error al cargar el procurador')
      } finally {
        setLoadingDetails(false)
      }
    }

    fetchProcuradorDetails()

    return () => {
      abortController.abort()
    }
  }, [isOpen, procurador])

  if (!isOpen) return null

  const normalizedBankSearch = bankSearchTerm.trim().toLowerCase()
  const visibleBancos = bancos.filter((item) => {
    if (!normalizedBankSearch) return true
    return item.nombre.toLowerCase().includes(normalizedBankSearch)
  })

  const toggleBanco = (targetBancoId: number, checked: boolean) => {
    setSelectedBancoIds((prev) => {
      if (checked) {
        return prev.includes(targetBancoId) ? prev : [...prev, targetBancoId]
      }

      return prev.filter((id) => id !== targetBancoId)
    })
  }

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
      const emailValue = formData.email.trim() || null
      const telefonoValue = formData.telefono.trim() || null
      const notasValue = formData.notas.trim() || null

      if (procurador) {
        const response = await fetch(`/api/procuradores/${procurador.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: formData.nombre.trim(),
            email: emailValue,
            telefono: telefonoValue,
            notas: notasValue,
            bancoIds: selectedBancoIds,
          }),
          credentials: 'include',
        })

        const data = await response.json()
        if (!data.ok) {
          throw new Error(data.message || data.error || 'Error al actualizar el procurador')
        }

        onSuccess()
        return
      }

      const response = await fetch('/api/procuradores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre.trim(),
          email: emailValue,
          telefono: telefonoValue,
          notas: notasValue,
          bancoIds: selectedBancoIds,
        }),
        credentials: 'include',
      })

      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.message || data.error || 'Error al crear el procurador')
      }

      onSuccess({ reusedExisting: Boolean(data.reusedExisting) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {procurador ? 'Editar Procurador' : 'Agregar Nuevo Procurador'}
        </h2>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {loadingDetails && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              Cargando bancos asociados...
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Telefono
            </label>
            <input
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Notas
            </label>
            <textarea
              value={formData.notas}
              onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Asociar a banco
                </label>
                <p className="text-xs text-gray-500">
                  Puedes seleccionar uno o varios bancos.
                </p>
              </div>
              <span className="text-xs text-gray-500">
                {selectedBancoIds.length} seleccionado(s)
              </span>
            </div>

            <input
              type="text"
              value={bankSearchTerm}
              onChange={(e) => setBankSearchTerm(e.target.value)}
              placeholder="Buscar bancos..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            />

            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-gray-300 p-3">
              {visibleBancos.length === 0 ? (
                <p className="text-sm text-gray-500">No se encontraron bancos.</p>
              ) : (
                visibleBancos.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center space-x-2 rounded p-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBancoIds.includes(item.id)}
                      onChange={(e) => toggleBanco(item.id, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{item.nombre}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4">
            <button
              type="submit"
              disabled={submitting || loadingDetails}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
