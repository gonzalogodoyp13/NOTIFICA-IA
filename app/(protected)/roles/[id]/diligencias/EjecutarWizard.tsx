'use client'

import { useEffect, useMemo, useState } from 'react'

import { useEstamposGrouped } from '@/lib/hooks/useAjustes'
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
import { parseEstampoTipo, type EstampoTipo } from '@/lib/estampos/selection'

interface EjecutarWizardProps {
  rolId: string
  diligencia: DiligenciaItem
  rolData?: RolWorkspaceData
  initialStep?: 1 | 2 | 3
  onClose: () => void
  onSuccess?: () => void
  onOpenWizard?: (diligenciaId: string, categoria: string) => void
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
  initialStep,
  onClose,
  onSuccess,
  onOpenWizard,
}: EjecutarWizardProps) {
  // Get rol data if not provided
  const { data: rolDataFromHook } = useRolData(rolId)
  const rolData = rolDataProp || rolDataFromHook

  const { data: estamposGrouped, isLoading: estamposLoading } = useEstamposGrouped()
  const updateMeta = useUpdateDiligenciaMeta(rolId, diligencia.id)
  const generateBoleta = useGenerateBoleta(rolId, diligencia.id)
  const generateEstampo = useGenerateEstampo(rolId, diligencia.id)

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(initialStep ?? 1)

  // Step I fields
  const [fechaEjecucion, setFechaEjecucion] = useState('')
  const [horaEjecucion, setHoraEjecucion] = useState('')

  // Step II fields - nueva estructura unificada
  const [selectedEstampoTipo, setSelectedEstampoTipo] = useState<EstampoTipo | null>(null)
  const [monto, setMonto] = useState('')

  // Step III fields
  const [contenidoEstampo, setContenidoEstampo] = useState('')

  // UI state
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Initialize from meta using parseEstampoTipo
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
      // Use parseEstampoTipo for backward compatibility
      const estampoTipo = parseEstampoTipo(meta)
      if (estampoTipo) {
        setSelectedEstampoTipo(estampoTipo)
      }
      if (meta.monto) {
        setMonto(String(meta.monto))
      }
      if (meta.estampoDraft) {
        setContenidoEstampo(meta.estampoDraft as string)
      }
    }
  }, [diligencia.meta])

  // Get selected estampo (legacy only, for Step 3)
  const selectedEstampo = useMemo<EstampoCatalogItem | undefined>(() => {
    if (selectedEstampoTipo?.kind === 'LEGACY' && estamposGrouped?.legacy) {
      return estamposGrouped.legacy.find(
        item => String(item.id) === selectedEstampoTipo.estampoId
      )
    }
    return undefined
  }, [selectedEstampoTipo, estamposGrouped])

  // Auto-fill monto when legacy estampo is selected (Step II) - only for legacy
  useEffect(() => {
    if (
      step === 2 &&
      selectedEstampoTipo?.kind === 'LEGACY' &&
      selectedEstampoTipo.estampoId &&
      rolData
    ) {
      const abogado = rolData.abogado
      const bancoId = abogado?.banco?.id ?? null
      const abogadoId = abogado?.id ?? null

      if (bancoId && selectedEstampoTipo.estampoId) {
        // Call API to lookup arancel (auto-suggest only, doesn't block if fails)
        const params = new URLSearchParams({
          bancoId: String(bancoId),
          estampoId: selectedEstampoTipo.estampoId,
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
    // Wizard doesn't do lookup - monto is entered manually
  }, [step, selectedEstampoTipo, rolData])

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

    // Validar selección (wizard o legacy, no ambos)
    if (!selectedEstampoTipo) {
      setErrorMsg('Selecciona un tipo de estampo.')
      return
    }

    // Validar monto (requerido, pero no depende de lookup exitoso)
    const montoNum = cleanCuantiaInput(monto)
    if (montoNum === null || montoNum < 0) {
      setErrorMsg('El monto es requerido y debe ser mayor o igual a 0.')
      return
    }

    // Obtener nombre del estampo para el recibo
    let tipoEstampoNombre: string | undefined
    if (selectedEstampoTipo.kind === 'LEGACY') {
      tipoEstampoNombre = selectedEstampo?.nombre
    } else if (selectedEstampoTipo.kind === 'WIZARD') {
      // Para wizard, usar el label de la categoría
      const categoria = estamposGrouped?.wizard.find(
        cat => cat.categoria === selectedEstampoTipo.categoria
      )
      tipoEstampoNombre = categoria?.label
    }

    const validation = BoletaGenerateSchema.safeParse({
      monto: montoNum,
      medio: 'No especificado',
      referencia: undefined,
      tipoEstampoNombre,
    })

    if (!validation.success) {
      setErrorMsg(validation.error.issues[0]?.message ?? 'Datos inválidos.')
      return
    }

    generateBoleta.mutate(validation.data, {
      onSuccess: () => {
        // Guardar estampoTipo (nuevo formato) y monto
        const metaUpdates: Record<string, unknown> = {
          estampoTipo: selectedEstampoTipo,
          monto: montoNum,
        }

        // Mantener compatibilidad: escribir estampoId si es legacy
        if (selectedEstampoTipo.kind === 'LEGACY') {
          metaUpdates.estampoId = selectedEstampoTipo.estampoId
        }

        updateMeta.mutate(metaUpdates, {
          onSuccess: () => {
            if (continueToStep3) {
              // Si es wizard, abrir modal wizard y cerrar este wizard
              if (selectedEstampoTipo.kind === 'WIZARD' && selectedEstampoTipo.categoria) {
                onOpenWizard?.(diligencia.id, selectedEstampoTipo.categoria)
                onClose()
              } else if (selectedEstampoTipo.kind === 'LEGACY') {
                // Si es legacy, avanzar a Step 3 como antes
                setStep(3)
              }
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
              if (selectedEstampoTipo.kind === 'WIZARD' && selectedEstampoTipo.categoria) {
                onOpenWizard?.(diligencia.id, selectedEstampoTipo.categoria)
                onClose()
              } else if (selectedEstampoTipo.kind === 'LEGACY') {
                setStep(3)
              }
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

  // Handle Step III: Generate Estampo (solo para legacy)
  const handleStepIIIGenerate = () => {
    setErrorMsg(null)

    // Step 3 solo aplica para legacy
    if (!selectedEstampoTipo || selectedEstampoTipo.kind !== 'LEGACY') {
      setErrorMsg('No hay un estampo legacy seleccionado.')
      return
    }

    if (!selectedEstampoTipo.estampoId) {
      setErrorMsg('No hay un estampo seleccionado.')
      return
    }

    if (!contenidoEstampo.trim()) {
      setErrorMsg('El contenido del estampo no puede estar vacío.')
      return
    }

    const validation = EstampoGenerateSchema.safeParse({
      estampoId: selectedEstampoTipo.estampoId,
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
                    value={
                      selectedEstampoTipo?.kind === 'WIZARD'
                        ? `wizard:${selectedEstampoTipo.categoria}`
                        : selectedEstampoTipo?.kind === 'LEGACY'
                          ? `legacy:${selectedEstampoTipo.estampoId}`
                          : ''
                    }
                    onChange={e => {
                      const value = e.target.value
                      if (value.startsWith('wizard:')) {
                        const categoria = value.replace('wizard:', '')
                        setSelectedEstampoTipo({ kind: 'WIZARD', categoria })
                      } else if (value.startsWith('legacy:')) {
                        const estampoId = value.replace('legacy:', '')
                        setSelectedEstampoTipo({ kind: 'LEGACY', estampoId })
                      } else {
                        setSelectedEstampoTipo(null)
                      }
                    }}
                  >
                    <option value="">Seleccione un tipo de estampo…</option>
                    {/* Grupo Wizard */}
                    {estamposGrouped?.wizard && estamposGrouped.wizard.length > 0 && (
                      <optgroup label="Wizard (Global)">
                        {estamposGrouped.wizard.map(cat => (
                          <option key={`wizard:${cat.categoria}`} value={`wizard:${cat.categoria}`}>
                            {cat.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {/* Grupo Legacy */}
                    {estamposGrouped?.legacy && estamposGrouped.legacy.length > 0 && (
                      <optgroup label="Mis Estampos (Manuales)">
                        {estamposGrouped.legacy.map(item => (
                          <option key={`legacy:${item.id}`} value={`legacy:${item.id}`}>
                            {item.nombre}
                            {item.tipo ? ` (${item.tipo})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
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
                  {selectedEstampoTipo?.kind === 'LEGACY'
                    ? 'El monto se auto-completará si existe un arancel configurado.'
                    : 'Ingresa el monto manualmente.'}
                </p>
              </div>
            </>
          )}

          {/* Step III: Contenido Estampo (solo para legacy) */}
          {step === 3 && selectedEstampoTipo?.kind === 'LEGACY' && (
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
                className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
                onClick={() => setStep(1)}
                disabled={isLoading}
              >
                Anterior
              </button>
              <button
                type="button"
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                onClick={() => handleStepIIGenerate(false)}
                disabled={isLoading || !selectedEstampoTipo || !monto}
              >
                {isLoading ? 'Generando…' : 'Generar recibo'}
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
                onClick={() => handleStepIIGenerate(true)}
                disabled={isLoading || !selectedEstampoTipo || !monto}
              >
                {isLoading ? 'Generando…' : 'Generar recibo y continuar'}
              </button>
            </>
          )}

          {/* Step III buttons (solo para legacy) */}
          {step === 3 && selectedEstampoTipo?.kind === 'LEGACY' && (
            <>
              <button
                type="button"
                className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
                onClick={() => setStep(2)}
                disabled={isLoading}
              >
                Anterior
              </button>
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

