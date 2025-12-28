// Reusable Procurador selector component
// Fetches procuradores from API and provides a dropdown for selection
'use client'

import { useEffect, useState } from 'react'

interface Procurador {
  id: number
  nombre: string
  activo: boolean
}

interface ProcuradorSelectorProps {
  value: number | null
  onChange: (id: number | null) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  includeInactive?: boolean
  bancoId?: number
  className?: string
}

export function ProcuradorSelector({
  value,
  onChange,
  label = 'Procurador',
  placeholder = 'Selecciona un procurador',
  disabled = false,
  includeInactive = false,
  bancoId,
  className,
}: ProcuradorSelectorProps) {
  const [procuradores, setProcuradores] = useState<Procurador[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProcuradores = async () => {
      setLoading(true)
      setError(null)
      try {
        const url = `/api/procuradores${bancoId ? `?bancoId=${bancoId}` : ''}`
        const res = await fetch(url, { credentials: 'include' })
        const data = await res.json()
        if (!data.ok) {
          throw new Error(data.message || data.error || 'Error al cargar procuradores')
        }
        setProcuradores(data.data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar procuradores')
      } finally {
        setLoading(false)
      }
    }

    fetchProcuradores()
  }, [bancoId])

  // Filter out inactive procuradores unless includeInactive is true
  const filteredProcuradores = includeInactive
    ? procuradores
    : procuradores.filter(p => p.activo === true)

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}
      <select
        value={value?.toString() || ''}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
        disabled={disabled || loading}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <option value="">{loading ? 'Cargando procuradores...' : placeholder}</option>
        {!loading && filteredProcuradores.map((procurador) => (
          <option key={procurador.id} value={procurador.id}>
            {procurador.nombre}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}

