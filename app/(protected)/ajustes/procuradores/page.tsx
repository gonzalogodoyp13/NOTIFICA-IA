// Gestionar Procuradores page
// Full CRUD functionality for procuradores with banco linking
'use client'

import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import { ProcuradorModal } from './ProcuradorModal'
import { LinkProcuradorModal } from './LinkProcuradorModal'

interface Banco {
  id: number
  nombre: string
}

interface Abogado {
  id: number
  nombre: string | null
}

interface ProcuradorForBanco {
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

export default function ProcuradoresPage() {
  const [bancos, setBancos] = useState<Banco[]>([])
  const [selectedBancoId, setSelectedBancoId] = useState<number | null>(null)
  const [procuradoresForBanco, setProcuradoresForBanco] = useState<ProcuradorForBanco[]>([])
  const [loadingBancos, setLoadingBancos] = useState(true)
  const [loadingProcuradores, setLoadingProcuradores] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [editingProcurador, setEditingProcurador] = useState<ProcuradorForBanco | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [togglingBancoProcuradorForProcuradorId, setTogglingBancoProcuradorForProcuradorId] = useState<number | null>(null)
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null)

  useEffect(() => {
    fetchBancos()
  }, [])

  useEffect(() => {
    if (!selectedBancoId) {
      setProcuradoresForBanco([])
      return
    }

    const abortController = new AbortController()

    const fetchData = async () => {
      setLoadingProcuradores(true)
      setError(null)
      try {
        const res = await fetch(`/api/procuradores?bancoId=${selectedBancoId}`, {
          signal: abortController.signal,
          credentials: 'include',
        })
        if (!res.ok) throw new Error('Error al cargar procuradores')
        const data = await res.json()
        if (data.ok) {
          setProcuradoresForBanco(data.data)
        } else {
          throw new Error(data.message || data.error || 'Error al cargar procuradores')
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          setError(error.message || 'Error al cargar procuradores')
        }
      } finally {
        setLoadingProcuradores(false)
      }
    }

    fetchData()

    // Cleanup: abort request si selectedBancoId cambia antes de completar
    return () => {
      abortController.abort()
    }
  }, [selectedBancoId])

  const fetchBancos = async () => {
    try {
      const response = await fetch('/api/bancos', {
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        const errorMessage = data.message || data.error || 'Error al cargar los bancos'
        setError(errorMessage)
        setLoadingBancos(false)
        return
      }

      setBancos(data.data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoadingBancos(false)
    }
  }

  const handleToggleGlobalActivo = async (id: number) => {
    setTogglingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/procuradores/${id}/toggle-activo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.message || data.error || 'Error al cambiar estado')
      }
      // Refetch procuradores
      if (selectedBancoId) {
        const refetchRes = await fetch(`/api/procuradores?bancoId=${selectedBancoId}`, {
          credentials: 'include',
        })
        const refetchData = await refetchRes.json()
        if (refetchData.ok) {
          setProcuradoresForBanco(refetchData.data)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar estado')
    } finally {
      setTogglingId(null)
    }
  }

  const handleToggleBancoActivo = async (id: number) => {
    if (!selectedBancoId) return
    setTogglingBancoProcuradorForProcuradorId(id)
    setError(null)
    try {
      const response = await fetch(`/api/procuradores/${id}/banco/${selectedBancoId}/toggle-activo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.message || data.error || 'Error al cambiar estado')
      }
      // Refetch procuradores
      const refetchRes = await fetch(`/api/procuradores?bancoId=${selectedBancoId}`, {
        credentials: 'include',
      })
      const refetchData = await refetchRes.json()
      if (refetchData.ok) {
        setProcuradoresForBanco(refetchData.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar estado')
    } finally {
      setTogglingBancoProcuradorForProcuradorId(null)
    }
  }

  const handleUnlink = async (id: number) => {
    if (!selectedBancoId) return
    if (!window.confirm('¿Estás seguro de que deseas desvincular este procurador de este banco?')) {
      return
    }
    setUnlinkingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/procuradores/${id}/banco/${selectedBancoId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.message || data.error || 'Error al desvincular')
      }
      setSuccess('Procurador desvinculado exitosamente')
      // Refetch procuradores
      const refetchRes = await fetch(`/api/procuradores?bancoId=${selectedBancoId}`, {
        credentials: 'include',
      })
      const refetchData = await refetchRes.json()
      if (refetchData.ok) {
        setProcuradoresForBanco(refetchData.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al desvincular')
    } finally {
      setUnlinkingId(null)
    }
  }

  const handleCreateSuccess = () => {
    setSuccess('Procurador creado exitosamente')
    if (selectedBancoId) {
      fetch(`/api/procuradores?bancoId=${selectedBancoId}`, {
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            setProcuradoresForBanco(data.data)
          }
        })
        .catch(() => {})
    }
  }

  const handleLinkSuccess = () => {
    setSuccess('Procurador vinculado exitosamente')
    if (selectedBancoId) {
      fetch(`/api/procuradores?bancoId=${selectedBancoId}`, {
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            setProcuradoresForBanco(data.data)
          }
        })
        .catch(() => {})
    }
  }

  const handleEditSuccess = () => {
    setSuccess('Procurador actualizado exitosamente')
    if (selectedBancoId) {
      fetch(`/api/procuradores?bancoId=${selectedBancoId}`, {
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            setProcuradoresForBanco(data.data)
          }
        })
        .catch(() => {})
    }
  }

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">
              Gestionar Procuradores
            </h1>
            <p className="text-gray-600">
              Administra los procuradores y su vinculación con bancos
            </p>
          </div>

          {/* Banco Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Banco
            </label>
            <select
              value={selectedBancoId || ''}
              onChange={(e) => setSelectedBancoId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Selecciona un banco --</option>
              {bancos.map(banco => (
                <option key={banco.id} value={banco.id}>{banco.nombre}</option>
              ))}
            </select>
          </div>

          {/* Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800">{success}</p>
            </div>
          )}

          {/* Action Buttons */}
          {selectedBancoId && (
            <div className="mb-6 flex gap-4">
              <button
                onClick={() => {
                  setEditingProcurador(null)
                  setShowCreateModal(true)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Agregar Procurador
              </button>
              <button
                onClick={() => setShowLinkModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Vincular Procurador Existente
              </button>
            </div>
          )}

          {/* Content */}
          {!selectedBancoId ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">👔</div>
                <p className="text-gray-600 text-lg">
                  Selecciona un banco para ver los procuradores vinculados.
                </p>
              </div>
            </div>
          ) : loadingProcuradores ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <p className="text-gray-600">Cargando procuradores...</p>
              </div>
            </div>
          ) : procuradoresForBanco.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <div className="text-center py-12">
                <div className="text-4xl mb-4">👔</div>
                <p className="text-gray-600 text-lg">
                  No hay procuradores vinculados a este banco.
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Haz clic en "Agregar Procurador" o "Vincular Procurador Existente" para comenzar.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contacto
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Abogado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {procuradoresForBanco.map((procurador) => (
                    <tr key={procurador.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{procurador.nombre}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {procurador.email || procurador.telefono || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {procurador.abogado?.nombre || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            procurador.activo
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {procurador.activo ? 'Activo' : 'Inactivo'}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            procurador.bancoProcurador?.activo
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            Banco: {procurador.bancoProcurador?.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => {
                              setEditingProcurador(procurador)
                              setShowCreateModal(true)
                            }}
                            className="text-blue-600 hover:text-blue-900 font-medium"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleToggleGlobalActivo(procurador.id)}
                            className="text-blue-600 hover:text-blue-900"
                            disabled={togglingId === procurador.id}
                          >
                            {togglingId === procurador.id ? '...' : (procurador.activo ? 'Desactivar' : 'Activar')}
                          </button>
                          <button
                            onClick={() => handleToggleBancoActivo(procurador.id)}
                            className="text-blue-600 hover:text-blue-900"
                            disabled={togglingBancoProcuradorForProcuradorId === procurador.id}
                          >
                            {togglingBancoProcuradorForProcuradorId === procurador.id ? '...' : (procurador.bancoProcurador?.activo ? 'Desactivar en Banco' : 'Activar en Banco')}
                          </button>
                          <button
                            onClick={() => handleUnlink(procurador.id)}
                            className="text-red-600 hover:text-red-900"
                            disabled={unlinkingId === procurador.id}
                          >
                            {unlinkingId === procurador.id ? 'Desvinculando...' : 'Desvincular'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Navigation Links */}
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

      {/* Modals */}
      {showCreateModal && (
        <ProcuradorModal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false)
            setEditingProcurador(null)
          }}
          bancoId={editingProcurador ? null : selectedBancoId}
          procurador={editingProcurador || undefined}
          onSuccess={() => {
            setShowCreateModal(false)
            setEditingProcurador(null)
            if (editingProcurador) {
              handleEditSuccess()
            } else {
              handleCreateSuccess()
            }
          }}
        />
      )}

      {showLinkModal && selectedBancoId && (
        <LinkProcuradorModal
          isOpen={showLinkModal}
          onClose={() => setShowLinkModal(false)}
          bancoId={selectedBancoId}
          linkedProcuradorIds={procuradoresForBanco.map(p => p.id)}
          onSuccess={() => {
            setShowLinkModal(false)
            handleLinkSuccess()
          }}
        />
      )}
    </div>
  )
}

