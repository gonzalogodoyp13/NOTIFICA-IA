// Modal para crear/editar Procurador
'use client'

import { useEffect, useMemo, useState } from 'react'

interface Banco {
  id: number
  nombre: string
}

interface Abogado {
  id: number
  nombre: string | null
  bancos?: Array<{
    banco: Banco
  }>
}

interface Procurador {
  id: number
  nombre: string
  email: string | null
  telefono: string | null
  notas: string | null
  activo: boolean
  abogados?: Abogado[]
  abogadoIds?: number[]
  bancos?: Array<{
    bancoId: number
    banco: Banco
  }>
  createdAt: string
  updatedAt: string
}

interface ProcuradorModalProps {
  isOpen: boolean
  onClose: () => void
  procurador?: Procurador
  abogados: Abogado[]
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
  procurador,
  abogados,
  onSuccess,
}: ProcuradorModalProps) {
  const [formData, setFormData] = useState(emptyFormData)
  const [selectedAbogadoIds, setSelectedAbogadoIds] = useState<number[]>([])
  const [abogadoSearchTerm, setAbogadoSearchTerm] = useState('')
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
      setSelectedAbogadoIds(procurador.abogadoIds || procurador.abogados?.map((abogado) => abogado.id) || [])
    } else {
      setFormData(emptyFormData)
      setSelectedAbogadoIds([])
    }
    setAbogadoSearchTerm('')
    setError(null)
  }, [procurador, isOpen])

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
        setSelectedAbogadoIds(data.data.abogadoIds || [])
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

  const visibleAbogados = useMemo(() => {
    const normalized = abogadoSearchTerm.trim().toLowerCase()
    if (!normalized) return abogados
    return abogados.filter((item) => (item.nombre || '').toLowerCase().includes(normalized))
  }, [abogadoSearchTerm, abogados])

  const derivedBancos = useMemo(() => {
    const bancoMap = new Map<number, Banco>()

    abogados
      .filter((abogado) => selectedAbogadoIds.includes(abogado.id))
      .forEach((abogado) => {
        abogado.bancos?.forEach((item) => {
          bancoMap.set(item.banco.id, item.banco)
        })
      })

    return Array.from(bancoMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [abogados, selectedAbogadoIds])

  if (!isOpen) return null

  const toggleAbogado = (targetAbogadoId: number, checked: boolean) => {
    setSelectedAbogadoIds((prev) => {
      if (checked) {
        return prev.includes(targetAbogadoId) ? prev : [...prev, targetAbogadoId]
      }

      return prev.filter((id) => id !== targetAbogadoId)
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
      const payload = {
        nombre: formData.nombre.trim(),
        email: formData.email.trim() || null,
        telefono: formData.telefono.trim() || null,
        notas: formData.notas.trim() || null,
        abogadoIds: selectedAbogadoIds,
      }

      if (procurador) {
        const response = await fetch(`/api/procuradores/${procurador.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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
        body: JSON.stringify(payload),
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
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
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
              Cargando abogados asociados...
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

          <div className="grid gap-4 md:grid-cols-2">
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
                  Abogados asignados
                </label>
                <p className="text-xs text-gray-500">
                  Un procurador puede pertenecer a uno o varios abogados.
                </p>
              </div>
              <span className="text-xs text-gray-500">
                {selectedAbogadoIds.length} seleccionado(s)
              </span>
            </div>

            <input
              type="text"
              value={abogadoSearchTerm}
              onChange={(e) => setAbogadoSearchTerm(e.target.value)}
              placeholder="Buscar abogados..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            />

            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-gray-300 p-3">
              {visibleAbogados.length === 0 ? (
                <p className="text-sm text-gray-500">No se encontraron abogados.</p>
              ) : (
                visibleAbogados.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start space-x-2 rounded p-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAbogadoIds.includes(item.id)}
                      onChange={(e) => toggleAbogado(item.id, e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-sm text-gray-700">{item.nombre || `Abogado #${item.id}`}</div>
                      <div className="text-xs text-gray-500">
                        {(item.bancos || []).map((banco) => banco.banco.nombre).join(', ') || 'Sin bancos'}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-900">Bancos derivados</p>
            <p className="mt-1 text-xs text-blue-700">
              El acceso a bancos se calcula automaticamente desde los abogados seleccionados.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {derivedBancos.length === 0 ? (
                <span className="text-sm text-blue-700">Sin bancos derivados</span>
              ) : (
                derivedBancos.map((banco) => (
                  <span
                    key={banco.id}
                    className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-blue-700"
                  >
                    {banco.nombre}
                  </span>
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
