// Editar Demanda page
// Allows editing an existing Demanda (including ROL number)
// Reuses form structure from /demandas/nueva
// TODO: Refactor form into shared component for reuse
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface Abogado {
  id: number
  nombre: string | null
}

interface Tribunal {
  id: number
  nombre: string
}

interface Materia {
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
  } | null
  tribunal: {
    id: string
    nombre: string
  } | null
  abogado: {
    id: number | null
    nombre: string | null
  } | null
}

export default function EditarDemandaPage() {
  const router = useRouter()
  const params = useParams()
  const rolId = params.id as string
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abogados, setAbogados] = useState<Abogado[]>([])
  const [tribunales, setTribunales] = useState<Tribunal[]>([])
  const [materias, setMaterias] = useState<Materia[]>([])
  const [rolData, setRolData] = useState<RolData | null>(null)

  const [formData, setFormData] = useState({
    rol: '',
    tribunalId: '',
    caratula: '',
    cuantia: '',
    abogadoId: '',
    materiaId: '',
  })

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
          caratula: rol.demanda?.caratula || '',
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
      const [abogadosRes, tribunalesRes, materiasRes] = await Promise.all([
        fetch('/api/abogados', { credentials: 'include' }),
        fetch('/api/tribunales', { credentials: 'include' }),
        fetch('/api/materias', { credentials: 'include' }),
      ])

      if (abogadosRes.ok) {
        const data = await abogadosRes.json()
        if (data.ok) setAbogados(data.data || [])
      }
      if (tribunalesRes.ok) {
        const data = await tribunalesRes.json()
        if (data.ok) setTribunales(data.data || [])
      }
      if (materiasRes.ok) {
        const data = await materiasRes.json()
        if (data.ok) setMaterias(data.data || [])
      }
    } catch (err) {
      console.error('Error loading options:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!formData.rol || !formData.tribunalId || !formData.caratula) {
        throw new Error('ROL, Tribunal y Carátula son requeridos')
      }

      if (!rolData?.demanda?.id) {
        throw new Error('No se pudo obtener el ID de la demanda')
      }

      const payload = {
        rol: formData.rol,
        tribunalId: Number(formData.tribunalId),
        caratula: formData.caratula,
        cuantia: formData.cuantia ? Number(formData.cuantia) : null,
        abogadoId: formData.abogadoId ? Number(formData.abogadoId) : null,
        materiaId: formData.materiaId ? Number(formData.materiaId) : null,
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

              {/* Carátula */}
              <div>
                <label htmlFor="caratula" className="block text-sm font-medium text-gray-700 mb-2">
                  Carátula *
                </label>
                <input
                  type="text"
                  id="caratula"
                  required
                  value={formData.caratula}
                  onChange={(e) => setFormData({ ...formData, caratula: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: Juan Pérez con Pedro González"
                />
              </div>

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
                  onChange={(e) => setFormData({ ...formData, abogadoId: e.target.value })}
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

              {/* TODO: Ejecutados editing - to be implemented in a future phase */}

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

