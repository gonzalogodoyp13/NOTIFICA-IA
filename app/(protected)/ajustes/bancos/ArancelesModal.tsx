'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCuantiaCLP, cleanCuantiaInput } from '@/lib/utils/cuantia'

interface ArancelesModalProps {
  bancoId: number
  bancoNombre: string
  isOpen: boolean
  onClose: () => void
}

interface Estampo {
  id: string
  nombre: string
  tipo: string
  activo: boolean
}

interface Abogado {
  id: number
  nombre: string | null
}

interface ArancelRow {
  id?: number
  tempId?: string
  estampoId?: string
  estampoBaseCategoria?: string
  estampoNombre?: string
  tipo?: 'legacy' | 'wizard'
  monto: string
  activo: boolean
  isNew?: boolean
  isDirty?: boolean
}

interface ArancelResponse {
  id: number
  bancoId: number
  abogadoId: number | null
  estampoId: string | null
  estampoBaseCategoria: string | null
  monto: number
  activo: boolean
  tipo: 'legacy' | 'wizard'
  estampo: {
    id: string
    nombre: string
    tipo: string
    activo: boolean
  } | null
  abogado?: {
    id: number
    nombre: string | null
  } | null
}

interface WizardCategoria {
  categoria: string
  label: string
  count: number
}

export function ArancelesModal({ bancoId, bancoNombre, isOpen, onClose }: ArancelesModalProps) {
  const [activeTab, setActiveTab] = useState<'banco' | 'abogado'>('banco')
  const [selectedAbogadoId, setSelectedAbogadoId] = useState<number | null>(null)
  const [aranceles, setAranceles] = useState<ArancelRow[]>([])
  const [abogados, setAbogados] = useState<Abogado[]>([])
  const [estampos, setEstampos] = useState<Estampo[]>([])
  const [wizardCategorias, setWizardCategorias] = useState<WizardCategoria[]>([])
  const [categoriaLabelMap, setCategoriaLabelMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | number | null>(null)
  const [isSavingAny, setIsSavingAny] = useState(false)

  // Fetch estampos (solo tipo "modelo" y activo)
  const fetchEstampos = async () => {
    try {
      const response = await fetch('/api/estampos', { credentials: 'include' })
      const data = await response.json()
      if (data.ok && data.data) {
        const modelos = data.data.filter((e: Estampo) => e.tipo === 'modelo' && e.activo)
        setEstampos(modelos)
      }
    } catch (err) {
      console.error('Error fetching estampos:', err)
    }
  }

  // Fetch categorías wizard
  const fetchWizardCategorias = async () => {
    try {
      const response = await fetch('/api/estampos/wizard/categorias', { credentials: 'include' })
      const data = await response.json()
      if (data.ok && data.data) {
        setWizardCategorias(data.data)
        // Crear mapa de labels para lookup rápido
        const labelMap = new Map<string, string>()
        data.data.forEach((cat: WizardCategoria) => {
          labelMap.set(cat.categoria, cat.label)
        })
        setCategoriaLabelMap(labelMap)
      }
    } catch (err) {
      console.error('Error fetching wizard categorias:', err)
    }
  }

  // Fetch abogados del banco
  const fetchAbogados = useCallback(async () => {
    try {
      const response = await fetch(`/api/abogados?bancoId=${bancoId}`, { credentials: 'include' })
      const data = await response.json()
      if (data.ok && data.data) {
        setAbogados(data.data)
      }
    } catch (err) {
      console.error('Error fetching abogados:', err)
    }
  }, [bancoId])

  // Fetch aranceles banco-wide
  const fetchArancelesBanco = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/aranceles?bancoId=${bancoId}&abogadoId=null`, {
        credentials: 'include',
      })
      const data = await response.json()
      if (data.ok && data.data) {
        const rows: ArancelRow[] = data.data.map((a: ArancelResponse) => ({
          id: a.id,
          estampoId: a.estampoId ?? undefined,
          estampoBaseCategoria: a.estampoBaseCategoria ?? undefined,
          estampoNombre: a.tipo === 'legacy' ? a.estampo?.nombre : undefined,
          tipo: a.tipo,
          monto: formatCuantiaCLP(a.monto),
          activo: a.activo,
        }))
        setAranceles(rows)
      } else {
        setError(data.message || 'Error al cargar aranceles')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [bancoId])

  // Fetch aranceles por abogado
  const fetchArancelesAbogado = useCallback(async () => {
    if (!selectedAbogadoId) {
      setAranceles([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/aranceles?bancoId=${bancoId}&abogadoId=${selectedAbogadoId}`, {
        credentials: 'include',
      })
      const data = await response.json()
      if (data.ok && data.data) {
        const rows: ArancelRow[] = data.data.map((a: ArancelResponse) => ({
          id: a.id,
          estampoId: a.estampoId ?? undefined,
          estampoBaseCategoria: a.estampoBaseCategoria ?? undefined,
          estampoNombre: a.tipo === 'legacy' ? a.estampo?.nombre : undefined,
          tipo: a.tipo,
          monto: formatCuantiaCLP(a.monto),
          activo: a.activo,
        }))
        setAranceles(rows)
      } else {
        setError(data.message || 'Error al cargar aranceles')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [bancoId, selectedAbogadoId])

  // Cargar datos cuando se abre el modal
  useEffect(() => {
    if (isOpen && bancoId) {
      fetchEstampos()
      fetchWizardCategorias()
      if (activeTab === 'banco') {
        fetchArancelesBanco()
      } else {
        fetchAbogados()
        if (selectedAbogadoId) {
          fetchArancelesAbogado()
        }
      }
    }
  }, [activeTab, bancoId, fetchAbogados, fetchArancelesAbogado, fetchArancelesBanco, isOpen, selectedAbogadoId])

  // Cargar aranceles cuando cambia el abogado seleccionado
  useEffect(() => {
    if (isOpen && activeTab === 'abogado' && selectedAbogadoId) {
      fetchArancelesAbogado()
    }
  }, [activeTab, fetchArancelesAbogado, isOpen, selectedAbogadoId])

  // Reset al cambiar de tab
  useEffect(() => {
    if (activeTab === 'banco') {
      setSelectedAbogadoId(null)
      fetchArancelesBanco()
    } else {
      setAranceles([])
      fetchAbogados()
    }
  }, [activeTab, fetchAbogados, fetchArancelesBanco])

  // Helper function to get stable row key
  const getRowKey = (row: ArancelRow, index: number): string | number => {
    return row.id ?? row.tempId ?? `temp-${index}`
  }

  // Helper para generar key única de duplicado
  // Scope: banco-wide (abogadoKey='null') vs abogado-específico (abogadoKey=number)
  const getDuplicateKey = (row: ArancelRow): string | null => {
    // Banco tab → abogadoKey = 'null' (banco-wide)
    // Abogado tab → abogadoKey = selectedAbogadoId (abogado-específico)
    const abogadoKey = activeTab === 'abogado' && selectedAbogadoId ? String(selectedAbogadoId) : 'null'
    
    if (row.tipo === 'legacy' || (row.estampoId && !row.estampoBaseCategoria)) {
      if (!row.estampoId) return null
      return `L|${bancoId}|${abogadoKey}|${row.estampoId}`
    } else if (row.tipo === 'wizard' || (row.estampoBaseCategoria && !row.estampoId)) {
      if (!row.estampoBaseCategoria) return null
      return `W|${bancoId}|${abogadoKey}|${row.estampoBaseCategoria}`
    }
    return null
  }

  const handleAddRow = (tipo?: 'legacy' | 'wizard') => {
    const newRow: ArancelRow = {
      estampoId: tipo === 'legacy' ? '' : undefined,
      estampoBaseCategoria: tipo === 'wizard' ? '' : undefined,
      monto: '',
      activo: true,
      isNew: true,
      isDirty: true,
      tipo: tipo,
      tempId: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }
    setAranceles([...aranceles, newRow])
  }

  const handleUpdateRow = (index: number, field: keyof ArancelRow, value: any) => {
    const updated = [...aranceles]
    updated[index] = { ...updated[index], [field]: value, isDirty: true }
    setAranceles(updated)
  }

  const validateMonto = (value: string): boolean => {
    const cleaned = value.trim().replace(/\./g, '').replace(/\s/g, '')
    const parsed = parseInt(cleaned, 10)
    return !isNaN(parsed) && parsed >= 0
  }

  const handleSave = async (row: ArancelRow, index: number) => {
    // Hard guard: prevenir guardado paralelo incluso si UI no ha re-renderizado
    if (isSavingAny) {
      return
    }

    // Validaciones
    const isLegacy = row.tipo === 'legacy' || (row.estampoId && !row.estampoBaseCategoria)
    const isWizard = row.tipo === 'wizard' || (row.estampoBaseCategoria && !row.estampoId)

    if (isLegacy && !row.estampoId) {
      setError('Selecciona un estampo legacy')
      return
    }

    if (isWizard && !row.estampoBaseCategoria) {
      setError('Selecciona una categoría wizard')
      return
    }

    if (!row.monto || !validateMonto(row.monto)) {
      setError('El monto debe ser un número válido')
      return
    }

    // Verificar duplicados en la lista (con scope completo)
    const currentKey = getDuplicateKey(row)
    if (currentKey) {
      const duplicate = aranceles.some((r, i) => {
        if (i === index || r.id === row.id) return false
        const otherKey = getDuplicateKey(r)
        return otherKey === currentKey
      })
      
      if (duplicate) {
        const tipoText = row.tipo === 'wizard' ? 'categoría wizard' : 'estampo'
        setError(`Este ${tipoText} ya tiene un arancel definido para este ${activeTab === 'abogado' ? 'abogado' : 'banco'}`)
        return
      }
    }

    const rowKey = getRowKey(row, index)
    setError(null)
    setSavingId(rowKey)
    setIsSavingAny(true)

    try {
      const montoParsed = cleanCuantiaInput(row.monto) ?? 0
      const payload: any = {
        bancoId,
        monto: montoParsed,
        activo: row.activo,
      }

      if (isLegacy) {
        payload.estampoId = row.estampoId
      } else if (isWizard) {
        payload.estampoBaseCategoria = row.estampoBaseCategoria
      }

      if (activeTab === 'abogado' && selectedAbogadoId) {
        payload.abogadoId = selectedAbogadoId
      } else {
        payload.abogadoId = null
      }

      let response
      if (row.id) {
        // PUT
        response = await fetch(`/api/aranceles/${row.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monto: montoParsed, activo: row.activo }),
          credentials: 'include',
        })
      } else {
        // POST
        response = await fetch('/api/aranceles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        })
      }

      const data = await response.json()
      if (!data.ok) {
        // Preservar errorCode en el error para detección en catch
        const error = new Error(data.message || 'Error al guardar el arancel')
        ;(error as any).errorCode = data.errorCode
        throw error
      }

      // Actualizar la fila con los datos del servidor
      const updated = [...aranceles]
      const responseData = data.data as ArancelResponse
      updated[index] = {
        id: responseData.id,
        estampoId: responseData.estampoId ?? undefined,
        estampoBaseCategoria: responseData.estampoBaseCategoria ?? undefined,
        estampoNombre: responseData.tipo === 'legacy' ? responseData.estampo?.nombre : undefined,
        tipo: responseData.tipo,
        monto: formatCuantiaCLP(responseData.monto),
        activo: responseData.activo,
      }
      setAranceles(updated)

      // Refetch para sincronizar con servidor (evita desincronización)
      // Hacer refetch SOLO aquí, no en useEffect que dependa de aranceles
      if (activeTab === 'banco') {
        await fetchArancelesBanco()
      } else if (selectedAbogadoId) {
        await fetchArancelesAbogado()
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al guardar el arancel'
      
      // Obtener errorCode del error (preservado en throw)
      const errorCode = (err as any)?.errorCode
      
      // Detectar si es error de duplicado del servidor
      const isDuplicateError = errorCode === 'DUPLICATE' || 
                              errorMessage.includes('Ya existe') || 
                              errorMessage.includes('Duplicado')
      
      if (isDuplicateError) {
        // Mostrar error claro (NO mensaje suave)
        setError('Ya existe un arancel para esta combinación. Verifica la lista actualizada.')
        
        // Refetch para sincronizar UI con DB (ayuda si uno de dos requests paralelos tuvo éxito)
        if (activeTab === 'banco') {
          await fetchArancelesBanco()
        } else if (selectedAbogadoId) {
          await fetchArancelesAbogado()
        }
        
        // NO remover la fila - el usuario debe ver el error y decidir
      } else {
        // Error real - mostrar normalmente
        setError(errorMessage)
      }
    } finally {
      setSavingId(null)
      setIsSavingAny(false)
    }
  }

  const handleDelete = async (id: number, index: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este arancel?')) {
      return
    }

    try {
      const response = await fetch(`/api/aranceles/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.message || 'Error al eliminar el arancel')
      }

      // Remover de la lista
      const updated = aranceles.filter((_, i) => i !== index)
      setAranceles(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el arancel')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Aranceles del Banco: {bancoNombre}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('banco')}
              className={`px-6 py-3 font-medium text-sm ${
                activeTab === 'banco'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Aranceles del Banco (por defecto)
            </button>
            <button
              onClick={() => setActiveTab('abogado')}
              className={`px-6 py-3 font-medium text-sm ${
                activeTab === 'abogado'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Aranceles por Abogado
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {activeTab === 'abogado' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seleccionar Abogado:
              </label>
              <select
                value={selectedAbogadoId || ''}
                onChange={(e) => setSelectedAbogadoId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Selecciona un abogado --</option>
                {abogados.map((abogado) => (
                  <option key={abogado.id} value={abogado.id}>
                    {abogado.nombre || `Abogado #${abogado.id}`}
                  </option>
                ))}
              </select>
              {abogados.length === 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  Este banco no tiene abogados asignados.
                </p>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Cargando aranceles...</p>
            </div>
          ) : estampos.length === 0 && wizardCategorias.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">
                No hay estampos ni categorías wizard disponibles. Crea estampos en Ajustes → Estampos primero.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Estampo / Categoría
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Monto (CLP)
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {aranceles.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                          No hay aranceles definidos. Haz clic en &apos;Agregar Arancel&apos; para crear uno.
                        </td>
                      </tr>
                    ) : (
                      aranceles.map((row, index) => (
                        <tr key={row.id || `new-${index}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            {row.tipo === 'wizard' || (!row.estampoId && row.estampoBaseCategoria) ? (
                              // Dropdown para categorías wizard
                              <select
                                value={row.estampoBaseCategoria || ''}
                                onChange={(e) => handleUpdateRow(index, 'estampoBaseCategoria', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                disabled={!!row.id}
                              >
                                <option value="">-- Selecciona categoría wizard --</option>
                                {wizardCategorias.map((cat) => (
                                  <option key={cat.categoria} value={cat.categoria}>
                                    {cat.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              // Dropdown para estampos legacy
                              <select
                                value={row.estampoId || ''}
                                onChange={(e) => handleUpdateRow(index, 'estampoId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                disabled={!!row.id}
                              >
                                <option value="">-- Selecciona estampo --</option>
                                {estampos.map((estampo) => (
                                  <option key={estampo.id} value={estampo.id}>
                                    {estampo.nombre}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={row.monto}
                              onChange={(e) => handleUpdateRow(index, 'monto', e.target.value)}
                              placeholder="12.000"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              disabled={!!row.id && !row.isDirty}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {(row.isNew || row.isDirty) && (() => {
                              const rowKey = getRowKey(row, index)
                              const isSaving = savingId !== null && savingId === rowKey
                              return (
                                <button
                                  onClick={() => handleSave(row, index)}
                                  disabled={isSaving || isSavingAny}
                                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm disabled:opacity-50"
                                >
                                  {isSaving ? 'Guardando...' : 'Guardar'}
                                </button>
                              )
                            })()}
                            {row.id && (
                              <button
                                onClick={() => handleDelete(row.id!, index)}
                                className="ml-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition text-sm"
                              >
                                Eliminar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleAddRow('legacy')}
                  disabled={estampos.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Agregar Arancel Legacy
                </button>
                <button
                  onClick={() => handleAddRow('wizard')}
                  disabled={wizardCategorias.length === 0}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Agregar Arancel Wizard
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
