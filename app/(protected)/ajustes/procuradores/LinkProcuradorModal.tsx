// Modal para vincular Procurador existente a un Banco
'use client'

import { useEffect, useState, useCallback } from 'react'

interface Procurador {
  id: number
  nombre: string
  email: string | null
  telefono: string | null
}

interface LinkProcuradorModalProps {
  isOpen: boolean
  onClose: () => void
  bancoId: number
  linkedProcuradorIds: number[]
  onSuccess: () => void
}

export function LinkProcuradorModal({
  isOpen,
  onClose,
  bancoId,
  linkedProcuradorIds,
  onSuccess,
}: LinkProcuradorModalProps) {
  const [allProcuradores, setAllProcuradores] = useState<Procurador[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [linkingId, setLinkingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAllProcuradores = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/procuradores', {
        credentials: 'include',
      })
      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.message || data.error || 'Error al cargar procuradores')
      }
      setAllProcuradores(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar procuradores')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen && allProcuradores.length === 0) {
      fetchAllProcuradores()
    }
  }, [allProcuradores.length, fetchAllProcuradores, isOpen])

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('')
      setError(null)
    }
  }, [isOpen])

  const filteredProcuradores = allProcuradores.filter(p => {
    // Excluir ya vinculados usando prop linkedProcuradorIds
    if (linkedProcuradorIds.includes(p.id)) return false

    // Filtrar por búsqueda
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      p.nombre.toLowerCase().includes(term) ||
      (p.email && p.email.toLowerCase().includes(term))
    )
  })

  const handleLink = async (id: number) => {
    setLinkingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/procuradores/${id}/link-banco`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bancoId }),
        credentials: 'include',
      })

      const data = await response.json()
      if (!data.ok) {
        if (data.errorCode === 'DUPLICATE') {
          throw new Error('Este procurador ya está vinculado a este banco')
        }
        throw new Error(data.message || data.error || 'Error al vincular procurador')
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al vincular procurador')
    } finally {
      setLinkingId(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Vincular Procurador Existente
        </h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Search Input */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <p className="text-gray-600">Cargando procuradores...</p>
          </div>
        )}

        {/* Results Table */}
        {!loading && (
          <>
            {filteredProcuradores.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">
                  {searchTerm
                    ? 'No se encontraron procuradores que coincidan con la búsqueda.'
                    : 'No hay procuradores disponibles para vincular.'}
                </p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nombre
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contacto
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredProcuradores.map((procurador) => (
                      <tr key={procurador.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{procurador.nombre}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {procurador.email || procurador.telefono || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleLink(procurador.id)}
                            disabled={linkingId === procurador.id}
                            className="text-blue-600 hover:text-blue-900 font-medium disabled:opacity-50"
                          >
                            {linkingId === procurador.id ? 'Vinculando...' : 'Vincular'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Close Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

