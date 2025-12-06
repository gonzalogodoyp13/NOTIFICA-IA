'use client'

import { useEffect, useMemo, useState } from 'react'

import { useEstampos } from '@/lib/hooks/useAjustes'
import {
  useGenerateBoleta,
  useGenerateEstampo,
  useRolData,
  useUpdateDiligenciaMeta,
  type DiligenciaItem,
  type RolWorkspaceData,
} from '@/lib/hooks/useRolWorkspace'
import { BoletaGenerateSchema, EstampoGenerateSchema } from '@/lib/validations/rol-workspace'
import { cleanCuantiaInput } from '@/lib/utils/cuantia'

interface EjecutarWizardProps {
  rolId: string
  diligencia: DiligenciaItem
  rolData?: RolWorkspaceData
  onClose: () => void
  onSuccess?: () => void
}

interface EstampoCatalogItem {
  id: string
  nombre: string
  tipo?: string | null
  contenido?: string | null
}

export default function EjecutarWizard({
  rolId,
  diligencia,
  rolData: rolDataProp,
  onClose,
  onSuccess,
}: EjecutarWizardProps) {
  // Get rol data if not provided
  const { data: rolDataFromHook } = useRolData(rolId)
  const rolData = rolDataProp || rolDataFromHook

  const { data: estampos = [], isLoading: estamposLoading } = useEstampos()
  const updateMeta = useUpdateDiligenciaMeta(rolId, diligencia.id)
  const generateBoleta = useGenerateBoleta(rolId, diligencia.id)
  const generateEstampo = useGenerateEstampo(rolId, diligencia.id)

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step I fields
  const [fechaEjecucion, setFechaEjecucion] = useState('')
  const [horaEjecucion, setHoraEjecucion] = useState('')

  // Step II fields
  const [selectedEstampoId, setSelectedEstampoId] = useState('')
  const [monto, setMonto] = useState('')

  // Step III fields
  const [contenidoEstampo, setContenidoEstampo] = useState('')

  // UI state
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Initialize from meta
  useEffect(() => {
    const meta = diligencia.meta as Record<string, unknown> | null | undefined
    if (meta) {
      if (meta.fechaEjecucion) {
        const date = new Date(meta.fechaEjecucion as string)
        setFechaEjecucion(date.toISOString().split('T')[0])
      }
      if (meta.horaEjecucion) {
        setHoraEjecucion(meta.horaEjecucion as string)
      }
      if (meta.estampoId) {
        setSelectedEstampoId(String(meta.estampoId))
      }
      if (meta.monto) {
        setMonto(String(meta.monto))
      }
      if (meta.estampoDraft) {
        setContenidoEstampo(meta.estampoDraft as string)
      }
    }
  }, [diligencia.meta])

  // Get selected estampo
  const selectedEstampo = useMemo<EstampoCatalogItem | undefined>(
    () => estampos.find(item => String(item.id) === selectedEstampoId),
    [estampos, selectedEstampoId]
  )

  // Auto-fill monto when estampo is selected (Step II)
  useEffect(() => {
    if (step === 2 && selectedEstampoId && rolData) {
      const demanda = rolData.demanda
      const abogado = rolData.abogado
      const bancoId = abogado?.banco?.id ?? null
      const abogadoId = demanda?.abogadoId ?? abogado?.id ?? null

      if (bancoId && selectedEstampoId) {
        // Call API to lookup arancel
        const params = new URLSearchParams({
          bancoId: String(bancoId),
          estampoId: selectedEstampoId,
        })
        if (abogadoId) {
          params.append('abogadoId', String(abogadoId))
        }

        fetch(`/api/aranceles/lookup?${params.toString()}`, {
          credentials: 'include',
        })
          .then(res => res.json())
          .then(data => {
            if (data.ok && data.data?.monto) {
              setMonto(String(data.data.monto))
            }
          })
          .catch(() => {
            // Silently fail - user can enter monto manually
          })
      }
    }
  }, [step, selectedEstampoId, rolData])

  // Pre-fill contenidoEstampo when entering Step III
  useEffect(() => {
    if (step === 3) {
      const meta = diligencia.meta as Record<string, unknown> | null | undefined
      if (meta?.estampoDraft) {
        setContenidoEstampo(meta.estampoDraft as string)
      } else if (selectedEstampo?.contenido) {
        setContenidoEstampo(selectedEstampo.contenido)
      }
    }
  }, [step, diligencia.meta, selectedEstampo])

  // Handle Step I: Save fecha/hora
  const handleStepISave = async (goToNext: boolean) => {
    setErrorMsg(null)

    if (!fechaEjecucion) {
      setErrorMsg('La fecha de ejecución es requerida.')
      return
    }

    if (horaEjecucion && !/^([01]\d|2[0-3]):[0-5]\d$/.test(horaEjecucion)) {
      setErrorMsg('La hora debe estar en formato HH:mm (ej: 14:30).')
      return
    }

    const metaUpdates: Record<string, unknown> = {
      fechaEjecucion: new Date(fechaEjecucion).toISOString(),
    }
    if (horaEjecucion) {
      metaUpdates.horaEjecucion = horaEjecucion
    }

    updateMeta.mutate(metaUpdates, {
      onSuccess: () => {
        if (goToNext) {
          setStep(2)
        } else {
          setSuccessMsg('Datos guardados correctamente.')
          setTimeout(() => {
            onClose()
          }, 1500)
        }
      },
      onError: error => {
        setErrorMsg(error.message || 'Error al guardar los datos.')
      },
    })
  }

  // Handle Step II: Generate Boleta
  const handleStepIIGenerate = async (continueToStep3: boolean) => {
    setErrorMsg(null)

    if (!selectedEstampoId) {
      setErrorMsg('Selecciona un tipo de estampo.')
      return
    }

    const montoNum = cleanCuantiaInput(monto)
    if (montoNum === null || montoNum < 0) {
      setErrorMsg('El monto es requerido y debe ser mayor o igual a 0.')
      return
    }

    const validation = BoletaGenerateSchema.safeParse({
      monto: montoNum,
      medio: 'No especificado',
      referencia: undefined,
    })

    if (!validation.success) {
      setErrorMsg(validation.error.issues[0]?.message ?? 'Datos inválidos.')
      return
    }

    generateBoleta.mutate(validation.data, {
      onSuccess: () => {
        // Save estampoId and monto to meta
        const metaUpdates: Record<string, unknown> = {
          estampoId: selectedEstampoId,
          monto: montoNum,
        }
        updateMeta.mutate(metaUpdates, {
          onSuccess: () => {
            if (continueToStep3) {
              setStep(3)
            } else {
              setSuccessMsg('Recibo generado correctamente.')
              onSuccess?.()
              setTimeout(() => {
                onClose()
              }, 1500)
            }
          },
          onError: () => {
            // Boleta was generated but meta update failed - still continue
            if (continueToStep3) {
              setStep(3)
            } else {
              onClose()
            }
          },
        })
      },
      onError: error => {
        setErrorMsg(error.message || 'No se pudo generar el recibo.')
      },
    })
  }

  // Handle Step III: Save draft
  const handleStepIIISave = async () => {
    setErrorMsg(null)

    if (!contenidoEstampo.trim()) {
      setErrorMsg('El contenido del estampo no puede estar vacío.')
      return
    }

    const metaUpdates: Record<string, unknown> = {
      estampoDraft: contenidoEstampo.trim(),
    }

    updateMeta.mutate(metaUpdates, {
      onSuccess: () => {
        setSuccessMsg('Borrador guardado correctamente.')
        setTimeout(() => {
          onClose()
        }, 1500)
      },
      onError: error => {
        setErrorMsg(error.message || 'Error al guardar el borrador.')
      },
    })
  }

  // Handle Step III: Generate Estampo
  const handleStepIIIGenerate = () => {
    setErrorMsg(null)

    if (!selectedEstampoId) {
      setErrorMsg('No hay un estampo seleccionado.')
      return
    }

    if (!contenidoEstampo.trim()) {
      setErrorMsg('El contenido del estampo no puede estar vacío.')
      return
    }

    const validation = EstampoGenerateSchema.safeParse({
      estampoId: selectedEstampoId,
      contenidoPersonalizado: contenidoEstampo.trim(),
    })

    if (!validation.success) {
      setErrorMsg(validation.error.issues[0]?.message ?? 'Datos inválidos.')
      return
    }

    generateEstampo.mutate(validation.data, {
      onSuccess: () => {
        // Optionally update meta with final draft
        const metaUpdates: Record<string, unknown> = {
          estampoDraft: contenidoEstampo.trim(),
        }
        updateMeta.mutate(metaUpdates, {
          onSuccess: () => {
            setSuccessMsg('Estampo generado correctamente.')
            onSuccess?.()
            setTimeout(() => {
              onClose()
            }, 1500)
          },
          onError: () => {
            // Estampo was generated but meta update failed - still close
            onSuccess?.()
            onClose()
          },
        })
      },
      onError: error => {
        setErrorMsg(error.message || 'No se pudo generar el estampo.')
      },
    })
  }

  const isLoading = updateMeta.isPending || generateBoleta.isPending || generateEstampo.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {step === 1 && 'Datos de ejecución'}
              {step === 2 && 'Datos del recibo'}
              {step === 3 && 'Generar estampo'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Paso {step} de 3
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-700"
            onClick={onClose}
            disabled={isLoading}
          >
            Cerrar
          </button>
        </header>

        <div className="mt-4 space-y-4 text-sm">
          {/* Step I: Fecha y Hora */}
          {step === 1 && (
            <>
              <div>
                <label className="block font-medium text-slate-700" htmlFor="fecha-ejecucion">
                  Fecha de ejecución *
                </label>
                <input
                  id="fecha-ejecucion"
                  type="date"
                  className="mt-1 w-full rounded border border-slate-300 p-2"
                  value={fechaEjecucion}
                  onChange={e => setFechaEjecucion(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700" htmlFor="hora-ejecucion">
                  Hora de ejecución
                </label>
                <input
                  id="hora-ejecucion"
                  type="time"
                  className="mt-1 w-full rounded border border-slate-300 p-2"
                  value={horaEjecucion}
                  onChange={e => setHoraEjecucion(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">Formato: HH:mm (ej: 14:30)</p>
              </div>
            </>
          )}

          {/* Step II: Estampo y Monto */}
          {step === 2 && (
            <>
              <div>
                <label className="block font-medium text-slate-700" htmlFor="tipo-estampo">
                  Tipo de Estampo *
                </label>
                {estamposLoading ? (
                  <p className="mt-2 text-xs text-slate-400">Cargando estampos…</p>
                ) : (
                  <select
                    id="tipo-estampo"
                    className="mt-1 w-full rounded border border-slate-300 p-2"
                    value={selectedEstampoId}
                    onChange={e => setSelectedEstampoId(e.target.value)}
                  >
                    <option value="">Seleccione un estampo…</option>
                    {estampos.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.nombre}
                        {item.tipo ? ` (${item.tipo})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block font-medium text-slate-700" htmlFor="monto">
                  Monto (CLP) *
                </label>
                <input
                  id="monto"
                  type="text"
                  className="mt-1 w-full rounded border border-slate-300 p-2"
                  placeholder="Ej: 4.000.000"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  El monto se auto-completará si existe un arancel configurado.
                </p>
              </div>
            </>
          )}

          {/* Step III: Contenido Estampo */}
          {step === 3 && (
            <div>
              <label className="block font-medium text-slate-700" htmlFor="contenido-estampo">
                Contenido del estampo *
              </label>
              <textarea
                id="contenido-estampo"
                className="mt-1 h-48 w-full rounded border border-slate-300 p-2 font-mono text-xs"
                placeholder="Contenido del estampo…"
                value={contenidoEstampo}
                onChange={e => setContenidoEstampo(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Puedes modificar el contenido antes de generar el PDF.
              </p>
            </div>
          )}
        </div>

        {errorMsg && <p className="mt-3 text-sm text-rose-600">{errorMsg}</p>}
        {successMsg && <p className="mt-3 text-sm text-emerald-600">{successMsg}</p>}

        <footer className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </button>

          {/* Step I buttons */}
          {step === 1 && (
            <>
              <button
                type="button"
                className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
                onClick={() => handleStepISave(false)}
                disabled={isLoading}
              >
                Guardar
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
                onClick={() => handleStepISave(true)}
                disabled={isLoading}
              >
                {isLoading ? 'Guardando…' : 'Siguiente'}
              </button>
            </>
          )}

          {/* Step II buttons */}
          {step === 2 && (
            <>
              <button
                type="button"
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                onClick={() => handleStepIIGenerate(false)}
                disabled={isLoading || !selectedEstampoId || !monto}
              >
                {isLoading ? 'Generando…' : 'Generar recibo'}
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
                onClick={() => handleStepIIGenerate(true)}
                disabled={isLoading || !selectedEstampoId || !monto}
              >
                {isLoading ? 'Generando…' : 'Generar recibo y continuar'}
              </button>
            </>
          )}

          {/* Step III buttons */}
          {step === 3 && (
            <>
              <button
                type="button"
                className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
                onClick={handleStepIIISave}
                disabled={isLoading || !contenidoEstampo.trim()}
              >
                {isLoading ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
                onClick={handleStepIIIGenerate}
                disabled={isLoading || !contenidoEstampo.trim()}
              >
                {isLoading ? 'Generando…' : 'Generar estampo'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

