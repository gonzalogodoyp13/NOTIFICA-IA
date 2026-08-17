// Nueva Demanda page
// Full form to create a new Demanda with all related data
'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import { cleanCuantiaInput } from '@/lib/utils/cuantia'
import { readApiError } from '@/lib/api/client'
import { ProcuradorSelector } from '@/components/ProcuradorSelector'

interface Banco {
  id: number
  nombre: string
}

interface Abogado {
  id: number
  nombre: string | null
  bancos?: Array<{
    banco: {
      id: number
      nombre: string
    }
  }>
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

export default function NuevaDemandaPage({
  searchParams,
}: {
  searchParams?: { rol?: string }
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bancos, setBancos] = useState<Banco[]>([])
  const [bancoId, setBancoId] = useState<string>('')
  const [caratulaDetalle, setCaratulaDetalle] = useState('')
  const [manualBankEnabled, setManualBankEnabled] = useState(false)
  const [manualBankName, setManualBankName] = useState('')
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
    rol: searchParams?.rol?.trim() ?? '',
    tribunalId: '',
    cuantia: '',
    abogadoId: '',
    materiaId: '',
    procuradorId: '',
  })

  const selectedBancoName = useMemo(() => {
    if (!bancoId) return ''
    return bancos.find(b => b.id === Number(bancoId))?.nombre || ''
  }, [bancoId, bancos])

  const caratulaPrefix = manualBankEnabled ? manualBankName.trim() : selectedBancoName.trim()
  const caratula = useMemo(() => {
    const detail = caratulaDetalle.trim()
    return caratulaPrefix && detail ? `${caratulaPrefix}/${detail}` : ''
  }, [caratulaDetalle, caratulaPrefix])

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
      setFormData(prev => ({ ...prev, abogadoId: '', procuradorId: '' }))
      return
    }

    // Filter abogados by bancoId using only abogado_bancos
    const selectedBancoId = Number(newBancoId)
    const filteredAbogados = allAbogados.filter(a => a.bancos?.some(rel => rel.banco.id === selectedBancoId))
    setAbogados(filteredAbogados)

    // Auto-select if exactly 1 abogado
    if (filteredAbogados.length === 1) {
      setFormData(prev => ({ ...prev, abogadoId: String(filteredAbogados[0].id), procuradorId: '' }))
    } else {
      // Clear abogadoId if 0 or >1 abogados
      setFormData(prev => ({ ...prev, abogadoId: '', procuradorId: '' }))
    }
  }

  const handleProcuradorChange = (id: number | null) => {
    setFormData(prev => ({ ...prev, procuradorId: id?.toString() || '' }))
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
    
    const firstBancoId = abogado?.bancos?.[0]?.banco.id

    if (firstBancoId) {
      setBancoId(String(firstBancoId))
      const filteredAbogados = allAbogados.filter(a => a.bancos?.some(rel => rel.banco.id === firstBancoId))
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
      if (!formData.rol || !formData.tribunalId || !bancoId || !caratula) {
        throw new Error('ROL, Tribunal, Banco y Carátula son requeridos')
      }
      
      const payload = {
        rol: formData.rol,
        tribunalId: formData.tribunalId,
        caratula,
        cuantia: formData.cuantia ? cleanCuantiaInput(formData.cuantia) : null,
        abogadoId: formData.abogadoId ? Number(formData.abogadoId) : null,
        materiaId: formData.materiaId ? Number(formData.materiaId) : null,
        procuradorId: formData.procuradorId ? Number(formData.procuradorId) : null,
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

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Error al crear la demanda'))
      }

      const data = await response.json().catch(() => ({}))

      if (!data.ok) {
        throw new Error(data?.error?.message || data?.error || 'Error al crear la demanda')
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

              {/* Carátula compuesta */}
              <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="caratula-detalle" className="text-sm font-semibold text-slate-800">
                    Carátula *
                  </label>
                  <label
                    htmlFor="caratula-banco-manual-toggle"
                    className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-sky-800"
                  >
                    <input
                      id="caratula-banco-manual-toggle"
                      type="checkbox"
                      checked={manualBankEnabled}
                      onChange={(event) => {
                        setManualBankEnabled(event.target.checked)
                        setManualBankName('')
                      }}
                      className="h-4 w-4 rounded border-sky-300 text-blue-700 focus:ring-sky-400"
                    />
                    Ingresar banco manualmente
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  {manualBankEnabled ? (
                    <input
                      type="text"
                      aria-label="Banco manual de la carátula"
                      required
                      value={manualBankName}
                      onChange={(event) => setManualBankName(event.target.value)}
                      className="min-w-0 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Escriba el banco"
                    />
                  ) : (
                    <input
                      type="text"
                      aria-label="Banco de la carátula"
                      readOnly
                      value={selectedBancoName}
                      className="min-w-0 rounded-lg border border-sky-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700"
                      placeholder="Seleccione un banco arriba"
                    />
                  )}
                  <span aria-hidden="true" className="text-xl font-light text-slate-400">/</span>
                  <input
                    id="caratula-detalle"
                    type="text"
                    required
                    value={caratulaDetalle}
                    onChange={(event) => setCaratulaDetalle(event.target.value)}
                    className="min-w-0 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Complete la carátula"
                  />
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Vista final:{' '}
                  <strong className="font-semibold text-slate-700">
                    {caratula || 'Banco/Detalle de la carátula'}
                  </strong>
                </p>
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

              {/* Procurador */}
              <ProcuradorSelector
                value={formData.procuradorId ? Number(formData.procuradorId) : null}
                onChange={handleProcuradorChange}
                label="Procurador (opcional)"
                bancoId={bancoId ? Number(bancoId) : undefined}
                abogadoId={formData.abogadoId ? Number(formData.abogadoId) : undefined}
              />

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
                  type="text"
                  id="cuantia"
                  value={formData.cuantia}
                  onChange={(e) => setFormData({ ...formData, cuantia: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: 4.000.000"
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
                        <label htmlFor={`ejecutado-${index}-nombre`} className="block text-xs font-medium text-gray-600 mb-1">
                          Nombre *
                        </label>
                        <input
                          id={`ejecutado-${index}-nombre`}
                          type="text"
                          required
                          value={ejecutado.nombre}
                          onChange={(e) => updateEjecutado(index, 'nombre', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor={`ejecutado-${index}-rut`} className="block text-xs font-medium text-gray-600 mb-1">
                          RUT *
                        </label>
                        <input
                          id={`ejecutado-${index}-rut`}
                          type="text"
                          required
                          value={ejecutado.rut}
                          onChange={(e) => updateEjecutado(index, 'rut', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor={`ejecutado-${index}-direccion`} className="block text-xs font-medium text-gray-600 mb-1">
                          Dirección
                        </label>
                        <input
                          id={`ejecutado-${index}-direccion`}
                          type="text"
                          value={ejecutado.direccion}
                          onChange={(e) => updateEjecutado(index, 'direccion', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor={`ejecutado-${index}-comuna`} className="block text-xs font-medium text-gray-600 mb-1">
                          Comuna
                        </label>
                        <select
                          id={`ejecutado-${index}-comuna`}
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

