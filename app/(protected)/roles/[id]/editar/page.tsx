// Editar Demanda page
// Allows editing an existing Demanda (including ROL number)
// Reuses form structure from /demandas/nueva
// TODO: Refactor form into shared component for reuse
'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface Banco {
  id: number
  nombre: string
}

interface Abogado {
  id: number
  nombre: string | null
  bancoId: number | null
  banco: {
    id: number
    nombre: string
  } | null
}

interface Tribunal {
  id: number
  nombre: string
}

interface Materia {
  id: number
  nombre: string
}

interface Comuna {
  id: number
  nombre: string
}

interface RolData {
  rol: {
    id: string
    numero: string
    estado: string
  }
  demanda: {
    id: string
    caratula: string | null
    cuantia: number | null
    materia: {
      id: number
      nombre: string
    } | null
    ejecutados?: Array<{
      id: string
      nombre: string
      rut: string
      direccion: string | null
      comuna: {
        id: number
        nombre: string
      } | null
    }>
  } | null
  tribunal: {
    id: string
    nombre: string
  } | null
  abogado: {
    id: number | null
    nombre: string | null
    banco: {
      id: number
      nombre: string
    } | null
  } | null
}

export default function EditarDemandaPage() {
  const router = useRouter()
  const params = useParams()
  const rolId = params.id as string
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bancos, setBancos] = useState<Banco[]>([])
  const [bancoId, setBancoId] = useState<string>('')
  const [abogados, setAbogados] = useState<Abogado[]>([])
  const [allAbogados, setAllAbogados] = useState<Abogado[]>([]) // Store all abogados for filtering
  const [tribunales, setTribunales] = useState<Tribunal[]>([])
  const [materias, setMaterias] = useState<Materia[]>([])
  const [comunas, setComunas] = useState<Comuna[]>([])
  const [ejecutados, setEjecutados] = useState<Array<{
    id?: string
    nombre: string
    rut: string
    direccion: string
    comunaId: string
  }>>([])
  const [rolData, setRolData] = useState<RolData | null>(null)

  const [formData, setFormData] = useState({
    rol: '',
    tribunalId: '',
    cuantia: '',
    abogadoId: '',
    materiaId: '',
  })

  // Calculate caratula from selected banco
  const caratula = useMemo(() => {
    if (bancoId) {
      const banco = bancos.find(b => b.id === Number(bancoId))
      return banco?.nombre || ''
    }
    return ''
  }, [bancoId, bancos])

  useEffect(() => {
    if (rolId) {
      fetchRolData()
      fetchOptions()
    }
  }, [rolId])

  const fetchRolData = async () => {
    try {
      setLoadingData(true)
      const response = await fetch(`/api/roles/${rolId}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Error al cargar los datos del ROL')
      }

      const data = await response.json()
      if (data.ok && data.data) {
        setRolData(data.data)
        
        // Pre-fill form with current data
        const rol = data.data
        setFormData({
          rol: rol.rol?.numero || '',
          tribunalId: '', // Will be set after finding matching tribunales
          cuantia: rol.demanda?.cuantia ? String(rol.demanda.cuantia) : '',
          abogadoId: rol.abogado?.id ? String(rol.abogado.id) : '',
          materiaId: rol.demanda?.materia?.id ? String(rol.demanda.materia.id) : '',
        })

        // Find matching tribunales by nombre
        if (rol.tribunal?.nombre) {
          const tribunalesRes = await fetch('/api/tribunales', {
            credentials: 'include',
          })
          if (tribunalesRes.ok) {
            const tribunalesData = await tribunalesRes.json()
            if (tribunalesData.ok && tribunalesData.data) {
              const matchingTribunal = tribunalesData.data.find(
                (t: Tribunal) => t.nombre === rol.tribunal?.nombre
              )
              if (matchingTribunal) {
                setFormData(prev => ({
                  ...prev,
                  tribunalId: String(matchingTribunal.id),
                }))
              }
            }
          }
        }

        // Pre-fill banco: Priority 1 - from abogado.banco.id
        // Priority 2 - match by caratula nombre (will be done in fetchOptions after bancos load)
        if (rol.abogado?.banco?.id) {
          setBancoId(String(rol.abogado.banco.id))
        }

        // Pre-fill ejecutados from demanda.ejecutados
        if (rol.demanda?.ejecutados && rol.demanda.ejecutados.length > 0) {
          const ejecutadosData = rol.demanda.ejecutados.map((ej: { id: string; nombre: string; rut: string; direccion: string | null; comuna: { id: number; nombre: string } | null }) => ({
            id: ej.id, // Preservar ID de ejecutados existentes
            nombre: ej.nombre || '',
            rut: ej.rut || '',
            direccion: ej.direccion || '',
            comunaId: ej.comuna?.id ? String(ej.comuna.id) : '',
          }))
          setEjecutados(ejecutadosData)
        } else {
          // No ejecutados or empty array - initialize with empty array
          setEjecutados([])
        }
      } else {
        throw new Error(data.error || 'Error al cargar los datos del ROL')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoadingData(false)
    }
  }

  const fetchOptions = async () => {
    try {
      const [bancosRes, abogadosRes, tribunalesRes, materiasRes, comunasRes] = await Promise.all([
        fetch('/api/bancos', { credentials: 'include' }),
        fetch('/api/abogados', { credentials: 'include' }),
        fetch('/api/tribunales', { credentials: 'include' }),
        fetch('/api/materias', { credentials: 'include' }),
        fetch('/api/comunas', { credentials: 'include' }),
      ])

      let bancosData: Banco[] = []
      let abogadosData: Abogado[] = []
      
      if (bancosRes.ok) {
        const data = await bancosRes.json()
        if (data.ok) {
          bancosData = data.data || []
          setBancos(bancosData)
        }
      }
      
      if (abogadosRes.ok) {
        const data = await abogadosRes.json()
        if (data.ok) {
          abogadosData = data.data || []
          setAllAbogados(abogadosData)
        }
      }
      
      // After both bancos and abogados are loaded, handle matching
      // If bancoId not set yet, try to match by caratula (Priority 2)
      if (!bancoId && rolData?.demanda?.caratula && bancosData.length > 0) {
        const matchingBanco = bancosData.find(
          (b: Banco) => b.nombre === rolData.demanda?.caratula
        )
        if (matchingBanco) {
          setBancoId(String(matchingBanco.id))
          // Filter abogados for this banco
          if (abogadosData.length > 0) {
            const filtered = abogadosData.filter((a: Abogado) => a.bancoId === matchingBanco.id)
            setAbogados(filtered)
          }
        } else {
          // No matching banco found, show all abogados
          if (abogadosData.length > 0) {
            setAbogados(abogadosData)
          }
        }
      } else if (bancoId && abogadosData.length > 0) {
        // Filter abogados if bancoId is already set
        const filtered = abogadosData.filter((a: Abogado) => a.bancoId === Number(bancoId))
        setAbogados(filtered)
      } else if (abogadosData.length > 0) {
        // No banco selected, show all abogados
        setAbogados(abogadosData)
      }
      if (tribunalesRes.ok) {
        const data = await tribunalesRes.json()
        if (data.ok) setTribunales(data.data || [])
      }
      if (materiasRes.ok) {
        const data = await materiasRes.json()
        if (data.ok) setMaterias(data.data || [])
      }
      if (comunasRes.ok) {
        const data = await comunasRes.json()
        if (data.ok) setComunas(data.data || [])
      }
    } catch (err) {
      console.error('Error loading options:', err)
    }
  }

  const handleBancoChange = (newBancoId: string) => {
    setBancoId(newBancoId)
    
    if (!newBancoId) {
      // Clear banco: reset abogados list and clear abogadoId
      setAbogados(allAbogados)
      setFormData(prev => ({ ...prev, abogadoId: '' }))
      return
    }

    // Filter abogados by bancoId
    const filteredAbogados = allAbogados.filter(a => a.bancoId === Number(newBancoId))
    setAbogados(filteredAbogados)

    // Auto-select if exactly 1 abogado
    if (filteredAbogados.length === 1) {
      setFormData(prev => ({ ...prev, abogadoId: String(filteredAbogados[0].id) }))
    } else {
      // Clear abogadoId if 0 or >1 abogados
      setFormData(prev => ({ ...prev, abogadoId: '' }))
    }
  }

  const handleAbogadoChange = (newAbogadoId: string) => {
    setFormData(prev => ({ ...prev, abogadoId: newAbogadoId }))

    if (!newAbogadoId) {
      // If clearing abogado and no banco selected, clear everything
      if (!bancoId) {
        setBancoId('')
      }
      // If banco is selected, keep it
      return
    }

    // Find selected abogado
    const abogado = allAbogados.find(a => a.id === Number(newAbogadoId))
    
    if (abogado?.bancoId) {
      // Auto-select banco from abogado
      setBancoId(String(abogado.bancoId))
      // Filter abogados to show only those from this banco
      const filteredAbogados = allAbogados.filter(a => a.bancoId === abogado.bancoId)
      setAbogados(filteredAbogados)
    } else {
      // Abogado has no banco: clear banco selection
      setBancoId('')
      setAbogados(allAbogados)
    }
  }

  const addEjecutado = () => {
    setEjecutados([...ejecutados, { nombre: '', rut: '', direccion: '', comunaId: '' }])
  }

  const removeEjecutado = (index: number) => {
    setEjecutados(ejecutados.filter((_, i) => i !== index))
  }

  const updateEjecutado = (index: number, field: string, value: string) => {
    const updated = [...ejecutados]
    updated[index] = { ...updated[index], [field]: value }
    setEjecutados(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Calculate caratula from banco if not already set
      const finalCaratula = caratula || (bancoId ? bancos.find(b => b.id === Number(bancoId))?.nombre || '' : '')
      
      if (!formData.rol || !formData.tribunalId || !finalCaratula) {
        throw new Error('ROL, Tribunal y Banco son requeridos')
      }

      if (!rolData?.demanda?.id) {
        throw new Error('No se pudo obtener el ID de la demanda')
      }

      // Normalize ejecutados: empty strings → null
      const ejecutadosNormalized = ejecutados.map((ejecutado) => ({
        nombre: ejecutado.nombre,
        rut: ejecutado.rut,
        direccion: ejecutado.direccion.trim() || null,
        comunaId: ejecutado.comunaId ? Number(ejecutado.comunaId) : null,
      }))

      const payload = {
        rol: formData.rol,
        tribunalId: Number(formData.tribunalId),
        caratula: finalCaratula,
        cuantia: formData.cuantia ? Number(formData.cuantia) : null,
        abogadoId: formData.abogadoId ? Number(formData.abogadoId) : null,
        materiaId: formData.materiaId ? Number(formData.materiaId) : null,
        ejecutados: ejecutadosNormalized,
      }

      const response = await fetch(`/api/demandas/${rolData.demanda.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.ok) {
        const errorMessage = Array.isArray(data.error)
          ? data.error.map((e: any) => e.message || JSON.stringify(e)).join(', ')
          : (data.error || 'Error al actualizar la demanda')
        throw new Error(errorMessage)
      }

      // Redirect to ROL workspace
      router.push(`/roles/${rolId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la demanda')
    } finally {
      setLoading(false)
    }
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-white">
        <div className="pt-20 pb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center py-12">
              <p className="text-gray-600">Cargando datos del ROL...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!rolData) {
    return (
      <div className="min-h-screen bg-white">
        <div className="pt-20 pb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error || 'No se pudieron cargar los datos del ROL'}</p>
              <Link
                href={`/roles/${rolId}`}
                className="mt-4 inline-block text-blue-600 hover:text-blue-800 font-medium"
              >
                ← Volver al ROL
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="pt-20 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">
              Editar Demanda
            </h1>
            <p className="text-gray-600">
              Modifica los datos de la demanda del ROL {rolData.rol?.numero || rolId}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ROL */}
              <div>
                <label htmlFor="rol" className="block text-sm font-medium text-gray-700 mb-2">
                  ROL *
                </label>
                <input
                  type="text"
                  id="rol"
                  required
                  value={formData.rol}
                  onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: C-1234-2024"
                />
              </div>

              {/* Banco */}
              <div>
                <label htmlFor="bancoId" className="block text-sm font-medium text-gray-700 mb-2">
                  Banco *
                </label>
                <select
                  id="bancoId"
                  required
                  value={bancoId}
                  onChange={(e) => handleBancoChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar banco</option>
                  {bancos.map((banco) => (
                    <option key={banco.id} value={banco.id}>
                      {banco.nombre}
                    </option>
                  ))}
                </select>
                {bancoId && abogados.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    Este banco no tiene abogados asignados
                  </p>
                )}
              </div>

              {/* Carátula (hidden, auto-calculated) */}
              <input
                type="hidden"
                id="caratula"
                required
                value={caratula}
              />

              {/* Tribunal */}
              <div>
                <label htmlFor="tribunalId" className="block text-sm font-medium text-gray-700 mb-2">
                  Tribunal *
                </label>
                <select
                  id="tribunalId"
                  required
                  value={formData.tribunalId}
                  onChange={(e) => setFormData({ ...formData, tribunalId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar tribunal</option>
                  {tribunales.map((tribunal) => (
                    <option key={tribunal.id} value={tribunal.id}>
                      {tribunal.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Abogado */}
              <div>
                <label htmlFor="abogadoId" className="block text-sm font-medium text-gray-700 mb-2">
                  Abogado
                </label>
                <select
                  id="abogadoId"
                  value={formData.abogadoId}
                  onChange={(e) => handleAbogadoChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar abogado (opcional)</option>
                  {abogados.map((abogado) => (
                    <option key={abogado.id} value={abogado.id}>
                      {abogado.nombre || `Abogado #${abogado.id}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Materia */}
              <div>
                <label htmlFor="materiaId" className="block text-sm font-medium text-gray-700 mb-2">
                  Materia
                </label>
                <select
                  id="materiaId"
                  value={formData.materiaId}
                  onChange={(e) => setFormData({ ...formData, materiaId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar materia (opcional)</option>
                  {materias.map((materia) => (
                    <option key={materia.id} value={materia.id}>
                      {materia.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cuantía */}
              <div>
                <label htmlFor="cuantia" className="block text-sm font-medium text-gray-700 mb-2">
                  Cuantía
                </label>
                <input
                  type="number"
                  id="cuantia"
                  step="0.01"
                  min="0"
                  value={formData.cuantia}
                  onChange={(e) => setFormData({ ...formData, cuantia: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>

              {/* Ejecutados */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Ejecutados
                  </label>
                  <button
                    type="button"
                    onClick={addEjecutado}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Agregar Ejecutado
                  </button>
                </div>
                {ejecutados.map((ejecutado, index) => (
                  <div key={index} className="mb-4 p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Ejecutado {index + 1}</span>
                      {ejecutados.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEjecutado(index)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Nombre *
                        </label>
                        <input
                          type="text"
                          required
                          value={ejecutado.nombre}
                          onChange={(e) => updateEjecutado(index, 'nombre', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          RUT *
                        </label>
                        <input
                          type="text"
                          required
                          value={ejecutado.rut}
                          onChange={(e) => updateEjecutado(index, 'rut', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Dirección
                        </label>
                        <input
                          type="text"
                          value={ejecutado.direccion}
                          onChange={(e) => updateEjecutado(index, 'direccion', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Comuna
                        </label>
                        <select
                          value={ejecutado.comunaId}
                          onChange={(e) => updateEjecutado(index, 'comunaId', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                        >
                          <option value="">Seleccionar comuna</option>
                          {comunas.map((comuna) => (
                            <option key={comuna.id} value={comuna.id}>
                              {comuna.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <div className="flex items-center gap-4 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              <Link
                href={`/roles/${rolId}`}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancelar
              </Link>
            </div>
          </form>
        </div>

        <div className="mt-8 flex items-center gap-4 flex-wrap">
          <Link
            href={`/roles/${rolId}`}
            className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2"
          >
            ← Volver al ROL
          </Link>
          <span className="text-gray-400">•</span>
          <Link
            href="/roles"
            className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2"
          >
            ← Volver a Roles
          </Link>
        </div>
      </div>
    </main>
  </div>
)
}

