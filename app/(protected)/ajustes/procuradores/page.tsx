// Gestionar Procuradores page
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import { ProcuradorModal } from './ProcuradorModal'

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

interface ProcuradorBanco {
  bancoId: number
  banco: Banco
}

interface ProcuradorListItem {
  id: number
  nombre: string
  email: string | null
  telefono: string | null
  notas: string | null
  activo: boolean
  abogados: Abogado[]
  abogadoIds: number[]
  bancos: ProcuradorBanco[]
  createdAt: string
  updatedAt: string
}

export default function ProcuradoresPage() {
  const [bancos, setBancos] = useState<Banco[]>([])
  const [abogados, setAbogados] = useState<Abogado[]>([])
  const [selectedBancoId, setSelectedBancoId] = useState<number | null>(null)
  const [selectedAbogadoId, setSelectedAbogadoId] = useState<number | null>(null)
  const [procuradores, setProcuradores] = useState<ProcuradorListItem[]>([])
  const [loadingBancos, setLoadingBancos] = useState(true)
  const [loadingProcuradores, setLoadingProcuradores] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProcurador, setEditingProcurador] = useState<ProcuradorListItem | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [bankFilterSearchTerm, setBankFilterSearchTerm] = useState('')
  const [showBancoDropdown, setShowBancoDropdown] = useState(false)
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent')
  const bancoFilterRef = useRef<HTMLDivElement | null>(null)

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const normalizedBankFilterSearchTerm = bankFilterSearchTerm.trim().toLowerCase()
  const selectedBanco = bancos.find((banco) => banco.id === selectedBancoId) || null
  const selectedAbogado = abogados.find((abogado) => abogado.id === selectedAbogadoId) || null
  const selectedBancoNombre = selectedBanco?.nombre || ''
  const visibleAbogadoOptions = abogados.filter((abogado) => {
    if (!selectedBancoId) return true
    return abogado.bancos?.some((rel) => rel.banco.id === selectedBancoId)
  })
  const visibleBancoOptions = bancos.filter((banco) => {
    if (!normalizedBankFilterSearchTerm) return true
    if (selectedBancoId === banco.id) return true
    return banco.nombre.toLowerCase().includes(normalizedBankFilterSearchTerm)
  })

  const filteredAndSortedProcuradores = useMemo(() => {
    return procuradores
      .filter((procurador) => {
        if (!normalizedSearchTerm) return true

        const abogadosTexto = procurador.abogados.map((abogado) => abogado.nombre || '').join(' ').toLowerCase()

        return (
          procurador.nombre.toLowerCase().includes(normalizedSearchTerm) ||
          (procurador.email || '').toLowerCase().includes(normalizedSearchTerm) ||
          (procurador.telefono || '').toLowerCase().includes(normalizedSearchTerm) ||
          abogadosTexto.includes(normalizedSearchTerm)
        )
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.nombre.localeCompare(b.nombre)
        }

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }, [normalizedSearchTerm, procuradores, sortBy])

  const fetchBancos = async () => {
    try {
      const response = await fetch('/api/bancos', {
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) {
        const errorMessage = data.message || data.error || 'Error al cargar los bancos'
        setError(errorMessage)
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

  const fetchAbogados = async () => {
    try {
      const response = await fetch('/api/abogados', {
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({ ok: false }))

      if (!data.ok) return
      setAbogados(data.data || [])
    } catch (err) {
      console.error('Error loading abogados:', err)
    }
  }

  const fetchProcuradores = async (bancoId: number | null, abogadoId: number | null, signal?: AbortSignal) => {
    setLoadingProcuradores(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (bancoId) params.set('bancoId', String(bancoId))
      if (abogadoId) params.set('abogadoId', String(abogadoId))
      const url = params.size > 0 ? `/api/procuradores?${params.toString()}` : '/api/procuradores'
      const response = await fetch(url, {
        signal,
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Error al cargar procuradores')
      }

      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.message || data.error || 'Error al cargar procuradores')
      }

      setProcuradores(data.data || [])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar procuradores')
    } finally {
      setLoadingProcuradores(false)
    }
  }

  const refreshVisibleProcuradores = async () => {
    await Promise.all([
      fetchAbogados(),
      fetchProcuradores(selectedBancoId, selectedAbogadoId),
    ])
  }

  useEffect(() => {
    fetchBancos()
    fetchAbogados()
  }, [])

  useEffect(() => {
    const abortController = new AbortController()
    fetchProcuradores(selectedBancoId, selectedAbogadoId, abortController.signal)

    return () => {
      abortController.abort()
    }
  }, [selectedAbogadoId, selectedBancoId])

  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => setSuccess(null), 5000)
    return () => clearTimeout(timer)
  }, [success])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  useEffect(() => {
    setBankFilterSearchTerm(selectedBancoNombre)
  }, [selectedBancoNombre])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!bancoFilterRef.current?.contains(event.target as Node)) {
        setShowBancoDropdown(false)
        setBankFilterSearchTerm(selectedBancoNombre)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedBancoNombre])

  const handleBancoSelect = (banco: Banco | null) => {
    setSelectedBancoId(banco?.id || null)
    setBankFilterSearchTerm(banco?.nombre || '')
    setShowBancoDropdown(false)
  }

  useEffect(() => {
    if (!selectedAbogadoId) return

    const abogadoMatchesBanco = visibleAbogadoOptions.some((abogado) => abogado.id === selectedAbogadoId)
    if (!abogadoMatchesBanco) {
      setSelectedAbogadoId(null)
    }
  }, [selectedAbogadoId, visibleAbogadoOptions])

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

      await refreshVisibleProcuradores()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar estado')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      <main className="pt-20 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="mb-2 text-3xl font-semibold text-gray-900">
                Gestionar Procuradores
              </h1>
              <p className="text-gray-600">
                Administra los procuradores por abogado. Los bancos se derivan automaticamente desde esos abogados.
              </p>
            </div>

            <button
              onClick={() => {
                setEditingProcurador(null)
                setShowCreateModal(true)
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Agregar Procurador
            </button>
          </div>

          <div className="mb-6 max-w-md space-y-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Filtrar por banco derivado
            </label>
            <div ref={bancoFilterRef} className="relative">
              <input
                type="text"
                value={bankFilterSearchTerm}
                onFocus={() => setShowBancoDropdown(true)}
                onChange={(e) => {
                  setBankFilterSearchTerm(e.target.value)
                  setShowBancoDropdown(true)
                }}
                placeholder="Todos los bancos"
                disabled={loadingBancos}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 focus:border-blue-500 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowBancoDropdown((prev) => !prev)}
                disabled={loadingBancos}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400"
                aria-label="Mostrar bancos"
              >
                ▾
              </button>

              {showBancoDropdown && !loadingBancos && (
                <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={() => handleBancoSelect(null)}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      selectedBancoId === null ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    Todos los bancos
                  </button>
                  {visibleBancoOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      No se encontraron bancos.
                    </div>
                  ) : (
                    visibleBancoOptions.map((banco) => (
                      <button
                        key={banco.id}
                        type="button"
                        onClick={() => handleBancoSelect(banco)}
                        className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                          selectedBancoId === banco.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        {banco.nombre}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mb-6 max-w-md space-y-2">
            <label htmlFor="abogado-filter" className="mb-2 block text-sm font-medium text-gray-700">
              Filtrar por abogado asignado
            </label>
            <select
              id="abogado-filter"
              value={selectedAbogadoId || ''}
              onChange={(e) => setSelectedAbogadoId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Todos los abogados</option>
              {visibleAbogadoOptions.map((abogado) => (
                <option key={abogado.id} value={abogado.id}>
                  {abogado.nombre || `Abogado #${abogado.id}`}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500">
              El banco sigue siendo derivado. Este filtro usa la relacion principal procurador-abogado.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-green-800">{success}</p>
            </div>
          )}

          {!loadingProcuradores && procuradores.length > 0 && (
            <div className="mb-6 flex flex-wrap items-end gap-4">
              <div className="max-w-md flex-1">
                <label htmlFor="buscar-procuradores" className="mb-2 block text-sm font-medium text-gray-700">
                  Buscar procuradores
                </label>
                <input
                  id="buscar-procuradores"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Escribe un nombre para filtrar..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div className="w-48">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Ordenar por
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'recent' | 'name')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="recent">Mas recientes</option>
                  <option value="name">Nombre</option>
                </select>
              </div>
            </div>
          )}

          {loadingProcuradores ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-md">
              <div className="py-12 text-center">
                <p className="text-gray-600">Cargando procuradores...</p>
              </div>
            </div>
          ) : procuradores.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-md">
              <div className="py-12 text-center">
                <p className="text-lg text-gray-600">
                  {selectedBancoId
                    ? 'No hay procuradores disponibles para este banco derivado.'
                    : 'No hay procuradores registrados aun.'}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Haz clic en &quot;Agregar Procurador&quot; para comenzar.
                </p>
              </div>
            </div>
          ) : filteredAndSortedProcuradores.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-md">
              <div className="py-12 text-center">
                <p className="text-lg text-gray-600">
                  No se encontraron procuradores para esta busqueda.
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Intenta con otro texto o borra el filtro para ver todos los procuradores.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nombre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contacto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Abogados</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Bancos derivados</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Estado</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredAndSortedProcuradores.map((procurador) => {
                    const bancosVisibles = procurador.bancos.slice(0, 2)
                    const extraBancosCount = procurador.bancos.length - bancosVisibles.length

                    return (
                      <tr key={procurador.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{procurador.nombre}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm text-gray-500">
                            {procurador.email || procurador.telefono || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {procurador.abogados.length === 0 ? (
                            '-'
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {procurador.abogados.map((abogado) => (
                                <span
                                  key={`${procurador.id}-${abogado.id}`}
                                  className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                                >
                                  {abogado.nombre || `Abogado #${abogado.id}`}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {procurador.bancos.length === 0 ? (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                              Sin banco derivado
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {bancosVisibles.map((banco) => (
                                <span
                                  key={`${procurador.id}-${banco.bancoId}`}
                                  className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                                >
                                  {banco.banco.nombre}
                                </span>
                              ))}
                              {extraBancosCount > 0 && (
                                <span
                                  className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                                  title={`${procurador.bancos.length} bancos derivados`}
                                >
                                  (+{extraBancosCount})
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`rounded px-2 py-1 text-xs font-medium ${
                              procurador.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {procurador.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => {
                                setEditingProcurador(procurador)
                                setShowCreateModal(true)
                              }}
                              className="font-medium text-blue-600 hover:text-blue-900"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleToggleGlobalActivo(procurador.id)}
                              className="text-blue-600 hover:text-blue-900"
                              disabled={togglingId === procurador.id}
                            >
                              {togglingId === procurador.id ? '...' : procurador.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/ajustes"
              className="inline-flex items-center gap-2 font-medium text-blue-600 transition-colors hover:text-blue-800"
            >
              {'<-'} Volver a Ajustes
            </Link>
            <span className="text-gray-400">.</span>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 font-medium text-blue-600 transition-colors hover:text-blue-800"
            >
              {'<-'} Volver al Dashboard
            </Link>
          </div>
        </div>
      </main>

      {showCreateModal && (
        <ProcuradorModal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false)
            setEditingProcurador(null)
          }}
          abogados={abogados}
          procurador={editingProcurador || undefined}
          onSuccess={async (result) => {
            setShowCreateModal(false)
            setEditingProcurador(null)
            setSuccess(
              editingProcurador
                ? 'Procurador actualizado exitosamente'
                : result?.reusedExisting
                  ? 'Se reutilizo un procurador existente y se actualizaron sus abogados.'
                  : 'Procurador creado exitosamente'
            )
            await refreshVisibleProcuradores()
          }}
        />
      )}
    </div>
  )
}
