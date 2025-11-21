// Nueva Demanda page
// Full form to create a new Demanda with all related data
'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
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

export default function NuevaDemandaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bancos, setBancos] = useState<Banco[]>([])
  const [bancoId, setBancoId] = useState<string>('')
  const [abogados, setAbogados] = useState<Abogado[]>([])
  const [allAbogados, setAllAbogados] = useState<Abogado[]>([]) // Store all abogados for filtering
  const [tribunales, setTribunales] = useState<Tribunal[]>([])
  const [materias, setMaterias] = useState<Materia[]>([])
  const [comunas, setComunas] = useState<Comuna[]>([])
  const [ejecutados, setEjecutados] = useState<Array<{
    nombre: string
    rut: string
    direccion: string
    comunaId: string
  }>>([{ nombre: '', rut: '', direccion: '', comunaId: '' }])

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
    fetchOptions()
  }, [])

  const fetchOptions = async () => {
    try {
      const [bancosRes, abogadosRes, tribunalesRes, materiasRes, comunasRes] = await Promise.all([
        fetch('/api/bancos', { credentials: 'include' }),
        fetch('/api/abogados', { credentials: 'include' }),
        fetch('/api/tribunales', { credentials: 'include' }),
        fetch('/api/materias', { credentials: 'include' }),
        fetch('/api/comunas', { credentials: 'include' }),
      ])

      if (bancosRes.ok) {
        const data = await bancosRes.json()
        if (data.ok) setBancos(data.data || [])
      }
      if (abogadosRes.ok) {
        const data = await abogadosRes.json()
        if (data.ok) {
          const abogadosData = data.data || []
          setAllAbogados(abogadosData)
          setAbogados(abogadosData) // Initially show all
        }
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
      
      const payload = {
        rol: formData.rol,
        tribunalId: Number(formData.tribunalId), // Ensure numeric ID (Phase 3)
        caratula: finalCaratula,
        cuantia: formData.cuantia ? Number(formData.cuantia) : null,
        abogadoId: formData.abogadoId ? Number(formData.abogadoId) : null,
        materiaId: formData.materiaId ? Number(formData.materiaId) : null,
        ejecutados: ejecutados.map((ejecutado) => ({
          nombre: ejecutado.nombre,
          rut: ejecutado.rut,
          direccion: ejecutado.direccion,
          comunaId: ejecutado.comunaId ? Number(ejecutado.comunaId) : null,
        })),
      }

      const response = await fetch('/api/demandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.ok) {
        const errorMessage = Array.isArray(data.error)
          ? data.error.map((e: any) => e.message || JSON.stringify(e)).join(', ')
          : (data.error || 'Error al crear la demanda')
        throw new Error(errorMessage)
      }

      router.push('/roles')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la demanda')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Topbar />
      
      <main className="pt-20 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">
              Nueva Demanda
            </h1>
            <p className="text-gray-600">
              Registra una nueva demanda en el sistema
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
                  {loading ? 'Guardando...' : 'Guardar Demanda'}
                </button>
                <Link
                  href="/roles"
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancelar
                </Link>
              </div>
            </form>
          </div>

          <div className="mt-8 flex items-center gap-4 flex-wrap">
            <Link
              href="/roles"
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2"
            >
              ← Volver a Roles
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

