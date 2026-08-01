'use client'

import { useEffect, useMemo, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import {
  ApiClientError,
  type DiligenciaItem,
  type NotificacionItem,
  type RolWorkspaceData,
  useGenerateRecibo,
  useReceiptWorkflow,
  useUpdateNotificacionMeta,
} from '@/lib/hooks/useRolWorkspace'
import { EstampoGenerateSchema, ReciboGenerateSchema } from '@/lib/validations/rol-workspace'
import { cleanCuantiaInput } from '@/lib/utils/cuantia'
import { parseEstampoTipo, type EstampoTipo } from '@/lib/estampos/selection'

interface EjecutarWizardProps {
  rolId: string
  diligencia: DiligenciaItem
  notificacionId: string
  rolData?: RolWorkspaceData
  initialStep?: 1 | 2 | 3
  onClose: () => void
  onSuccess?: () => void
  onOpenWizard?: (diligenciaId: string, categoria: string, notificacionId: string) => void
}

export default function EjecutarWizard({
  rolId,
  diligencia,
  notificacionId,
  initialStep,
  onClose,
  onSuccess,
  onOpenWizard,
}: EjecutarWizardProps) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2 | 3>(initialStep ?? 1)
  const { data: workflow, isLoading: workflowLoading, error: workflowError } = useReceiptWorkflow(
    rolId,
    diligencia.id,
    notificacionId,
    true,
    step === 3
  )

  const notificacion = useMemo<NotificacionItem | null>(() => {
    if (workflow?.notification) return workflow.notification
    const list = diligencia.notificaciones ?? []
    return list.find(n => n.id === notificacionId) ?? null
  }, [diligencia.notificaciones, notificacionId, workflow])

  const effectiveMeta = useMemo<Record<string, unknown>>(() => {
    const isPlainObject = (x: unknown): x is Record<string, unknown> =>
      !!x && typeof x === 'object' && !Array.isArray(x)

    const notiMeta = isPlainObject(notificacion?.meta) ? notificacion!.meta : null
    const diliMeta = isPlainObject(diligencia.meta)
      ? (diligencia.meta as Record<string, unknown>)
      : null
    const notiHasContent = notiMeta && Object.keys(notiMeta).length > 0
    return ((notiHasContent ? notiMeta : diliMeta) ?? {}) as Record<string, unknown>
  }, [diligencia.meta, notificacion])

  const updateMeta = useUpdateNotificacionMeta(rolId, diligencia.id, notificacionId)
  const generateRecibo = useGenerateRecibo(rolId, diligencia.id)
  const [creatingEstampo, setCreatingEstampo] = useState(false)
  const [renderingEstampoPreview, setRenderingEstampoPreview] = useState(false)

  // Step I fields
  const [fechaEjecucion, setFechaEjecucion] = useState('')
  const [horaEjecucion, setHoraEjecucion] = useState('')
  const [bancoId, setBancoId] = useState<number | null>(null)

  // Step II fields - nueva estructura unificada
  const [selectedEstampoTipo, setSelectedEstampoTipo] = useState<EstampoTipo | null>(null)
  const [monto, setMonto] = useState('')
  const [montoManual, setMontoManual] = useState(false)
  const [receiptOperation, setReceiptOperation] = useState<'GENERATE' | 'REGENERATE' | 'CORRECT'>('GENERATE')
  const [correctionReason, setCorrectionReason] = useState('')

  // Step III fields
  const [contenidoEstampo, setContenidoEstampo] = useState('')

  // UI state
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const appendDocumentoToCaches = (documento: Record<string, unknown>) => {
    queryClient.setQueryData(['rol', rolId, 'documentos'], (current: any[] | undefined) =>
      current ? [documento, ...current] : [documento]
    )

    queryClient.setQueryData(['rol', rolId], (current: any) => {
      if (!current) return current
      return {
        ...current,
        ultimaActividad: typeof documento.createdAt === 'string' ? documento.createdAt : current.ultimaActividad,
        kpis: {
          ...current.kpis,
          documentosTotal: current.kpis.documentosTotal + 1,
        },
        resumen: {
          ...current.resumen,
          documentos: [documento, ...(current.resumen?.documentos ?? [])],
        },
      }
    })
  }

  const patchNotificacionProgress = (patch: Partial<NotificacionItem>) => {
    queryClient.setQueryData(['rol', rolId, 'diligencias'], (current: DiligenciaItem[] | undefined) => {
      if (!current) return current

      return current.map(item =>
        item.id !== diligencia.id
          ? item
          : {
              ...item,
              notificaciones: item.notificaciones.map(notif =>
                notif.id === notificacionId ? { ...notif, ...patch } : notif
              ),
            }
      )
    })
  }

  useEffect(() => {
    if (workflow) {
      setFechaEjecucion(workflow.execution.fecha ?? '')
      setHoraEjecucion(workflow.execution.hora ?? '')
      setBancoId(workflow.bankContext.selectedBankId)
      setSelectedEstampoTipo(workflow.selectedEstampoTipo as EstampoTipo | null)
      setMonto(workflow.monto === null ? '' : String(workflow.monto))
      setReceiptOperation(workflow.receiptState ? 'REGENERATE' : 'GENERATE')
    } else if (effectiveMeta) {
      const ejecucion =
        effectiveMeta.ejecucion &&
        typeof effectiveMeta.ejecucion === 'object' &&
        !Array.isArray(effectiveMeta.ejecucion)
          ? (effectiveMeta.ejecucion as Record<string, unknown>)
          : null

      const fechaRaw =
        (typeof ejecucion?.fecha === 'string' && ejecucion.fecha) ||
        (typeof effectiveMeta.fechaEjecucion === 'string' && effectiveMeta.fechaEjecucion) ||
        null

      if (fechaRaw) {
        const date = new Date(fechaRaw)
        if (!Number.isNaN(date.getTime())) {
          setFechaEjecucion(date.toISOString().split('T')[0])
        }
      }

      const horaRaw =
        (typeof ejecucion?.hora === 'string' && ejecucion.hora) ||
        (typeof effectiveMeta.horaEjecucion === 'string' && effectiveMeta.horaEjecucion) ||
        ''

      if (horaRaw) {
        setHoraEjecucion(horaRaw)
      }
      // Use parseEstampoTipo for backward compatibility
      const estampoTipo = parseEstampoTipo(effectiveMeta)
      if (estampoTipo) {
        setSelectedEstampoTipo(estampoTipo)
      }
      if (effectiveMeta.monto) {
        setMonto(String(effectiveMeta.monto))
      }
      if (effectiveMeta.estampoDraft) {
        setContenidoEstampo(effectiveMeta.estampoDraft as string)
      }
    }
  }, [effectiveMeta, workflow])

  const selectedEstampo = useMemo(() => {
    if (selectedEstampoTipo?.kind !== 'CUSTOM') return undefined
    return workflow?.estampoOptions.find(
      item => item.selection.kind === 'CUSTOM' && item.selection.estampoId === selectedEstampoTipo.estampoId
    )
  }, [selectedEstampoTipo, workflow])

  useEffect(() => {
    if (step !== 2 || !selectedEstampoTipo || !bancoId || montoManual) return
    const option = workflow?.estampoOptions.find(item => {
      if (selectedEstampoTipo.kind === 'CUSTOM') {
        return item.selection.kind === 'CUSTOM' && item.selection.estampoId === selectedEstampoTipo.estampoId
      }
      return item.selection.kind === 'WIZARD' && item.selection.categoria === selectedEstampoTipo.categoria
    })
    const arancel = option?.aranceles.find(item => item.bancoId === bancoId)
    setMonto(arancel ? String(arancel.monto) : '')
  }, [step, selectedEstampoTipo, bancoId, montoManual, workflow])

  // Pre-fill contenidoEstampo with rendered data when entering Step III
  useEffect(() => {
    if (step !== 3 || selectedEstampoTipo?.kind !== 'CUSTOM' || !selectedEstampoTipo.estampoId) {
      return
    }

    const draft =
      typeof effectiveMeta?.estampoDraft === 'string' && effectiveMeta.estampoDraft.trim()
        ? effectiveMeta.estampoDraft
        : null
    const source = draft ?? selectedEstampo?.contenido ?? ''

    if (!source.trim()) {
      setContenidoEstampo('')
      return
    }

    let cancelled = false
    setRenderingEstampoPreview(true)
    setContenidoEstampo('')

    fetch(`/api/diligencias/${diligencia.id}/estampo/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        estampoId: selectedEstampoTipo.estampoId,
        notificacionId,
        contenidoPersonalizado: source,
      }),
    })
      .then(async res => {
        const result = await res.json().catch(() => null)
        if (!res.ok || result?.ok !== true) {
          throw new Error(
            (result && typeof result.error === 'string' && result.error) ||
              'No se pudo preparar el texto del estampo.'
          )
        }
        return result.data
      })
      .then(data => {
        if (cancelled) return
        setContenidoEstampo(
          typeof data?.renderedText === 'string'
            ? data.renderedText
            : source
        )
      })
      .catch(() => {
        if (!cancelled) {
          setContenidoEstampo(source)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRenderingEstampoPreview(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [step, effectiveMeta, selectedEstampo, selectedEstampoTipo, diligencia.id, notificacionId])

  // Handle Step I: Save fecha/hora
  const handleStepISave = async (goToNext: boolean) => {
    setErrorMsg(null)

    if (!notificacion) {
      setErrorMsg('Notificación no encontrada.')
      return
    }

    if (!fechaEjecucion) {
      setErrorMsg('La fecha de ejecución es requerida.')
      return
    }

    if (!bancoId) {
      setErrorMsg('Selecciona el banco del recibo.')
      return
    }

    if (horaEjecucion && !/^([01]\d|2[0-3]):[0-5]\d$/.test(horaEjecucion)) {
      setErrorMsg('La hora debe estar en formato HH:mm (ej: 14:30).')
      return
    }

    const metaUpdates: Record<string, unknown> = {
      // Importante: fechaEjecucion en UI es "YYYY-MM-DD". Evitar shift por timezone.
      fechaEjecucion: new Date(`${fechaEjecucion}T00:00:00`).toISOString(),
      // opcional (nuevo)
      ejecucion: { fecha: fechaEjecucion, hora: horaEjecucion || '' },
    }
    if (horaEjecucion) {
      metaUpdates.horaEjecucion = horaEjecucion
    }

    if (goToNext) {
      setStep(2)
      return
    }

    updateMeta.mutate({ meta: metaUpdates, bancoId }, {
      onSuccess: () => {
        setSuccessMsg('Datos guardados correctamente.')
        setTimeout(() => {
          onClose()
        }, 1500)
      },
      onError: error => {
        setErrorMsg(error.message || 'Error al guardar los datos.')
      },
    })
  }

  const handleStepIIGenerate = async (continueToStep3: boolean) => {
    setErrorMsg(null)

    if (!notificacion) {
      setErrorMsg('Notificación no encontrada.')
      return
    }

    if (!fechaEjecucion) {
      setErrorMsg('La fecha de ejecución es requerida.')
      return
    }

    if (!bancoId) {
      setErrorMsg('Selecciona el banco del recibo.')
      return
    }

    if (!selectedEstampoTipo) {
      setErrorMsg('Selecciona un tipo de estampo.')
      return
    }

    const montoNum = cleanCuantiaInput(monto)
    if (montoNum === null || montoNum < 0) {
      setErrorMsg('El monto es requerido y debe ser mayor o igual a 0.')
      return
    }

    const validation = ReciboGenerateSchema.safeParse({
      notificacionId,
      bancoId,
      operation: receiptOperation,
      ejecucion: { fecha: fechaEjecucion, hora: horaEjecucion || '' },
      estampoTipo: selectedEstampoTipo,
      monto: montoNum,
      medio: 'No especificado',
      referencia: undefined,
      correctionReason: receiptOperation === 'CORRECT' ? correctionReason : undefined,
    })

    if (!validation.success) {
      setErrorMsg(validation.error.issues[0]?.message ?? 'Datos inválidos.')
      return
    }

    try {
      await generateRecibo.mutateAsync(validation.data)
      if (continueToStep3) {
        if (selectedEstampoTipo.kind === 'WIZARD') {
          onOpenWizard?.(diligencia.id, selectedEstampoTipo.categoria, notificacionId)
          onClose()
        } else {
          setStep(3)
        }
      } else {
        setSuccessMsg(
          receiptOperation === 'CORRECT'
            ? 'Recibo corregido correctamente.'
            : receiptOperation === 'REGENERATE'
              ? 'Recibo regenerado correctamente.'
              : 'Recibo generado correctamente.'
        )
        onSuccess?.()
        setTimeout(onClose, 1500)
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'RECEIPT_CORRECTION_REQUIRED') {
        setReceiptOperation('CORRECT')
      }
      setErrorMsg(error instanceof Error ? error.message : 'No se pudo generar el recibo.')
    }
  }

  // Handle Step III: Save draft
  const handleStepIIISave = async () => {
    setErrorMsg(null)

    if (!notificacion) {
      setErrorMsg('Notificación no encontrada.')
      return
    }

    if (!contenidoEstampo.trim()) {
      setErrorMsg('El contenido del estampo no puede estar vacío.')
      return
    }

    const metaUpdates: Record<string, unknown> = {
      estampoDraft: contenidoEstampo.trim(),
    }

    updateMeta.mutate({ meta: metaUpdates }, {
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

    if (!notificacion) {
      setErrorMsg('Notificación no encontrada.')
      return
    }

    // Step 3 solo aplica para legacy
    if (!selectedEstampoTipo || selectedEstampoTipo.kind !== 'CUSTOM') {
      setErrorMsg('No hay un estampo personalizado seleccionado.')
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

    setCreatingEstampo(true)
    fetch(`/api/diligencias/${diligencia.id}/estampo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...validation.data, notificacionId }),
    })
      .then(async res => {
        const result = await res.json().catch(() => null)
        if (!res.ok || result?.ok !== true) {
          throw new Error(
            (result && typeof result.error === 'string' && result.error) ||
              'No se pudo generar el estampo.'
          )
        }
        if (result?.data && typeof result.data === 'object') {
          appendDocumentoToCaches(result.data as Record<string, unknown>)
          patchNotificacionProgress({
            step3Done: true,
            latestEstampoId: typeof result.data.id === 'string' ? result.data.id : null,
            workflowStatus:
              notificacion.workflowStatus === 'recibo_generado' || notificacion.latestReciboId
                ? 'ejecutada'
                : notificacion.workflowStatus,
            latestEstampo:
              result.data.estampo && typeof result.data.estampo === 'object'
                ? {
                    documentoId: typeof result.data.id === 'string' ? result.data.id : '',
                    slug: null,
                    nombreVisible:
                      typeof (result.data.estampo as Record<string, unknown>).nombre === 'string'
                        ? ((result.data.estampo as Record<string, unknown>).nombre as string)
                        : 'Estampo',
                  }
                : null,
          })
        }
        return result.data
      })
      .then(() => {
        const metaUpdates: Record<string, unknown> = {
          estampoDraft: contenidoEstampo.trim(),
        }
        updateMeta.mutate({ meta: metaUpdates }, {
          onSuccess: () => {
            setSuccessMsg('Estampo generado correctamente.')
            onSuccess?.()
            setTimeout(() => {
              onClose()
            }, 1500)
          },
          onError: () => {
            onSuccess?.()
            onClose()
          },
        })
      })
      .catch(error => {
        setErrorMsg(error?.message || 'No se pudo generar el estampo.')
      })
      .finally(() => setCreatingEstampo(false))
  }

  const isLoading =
    workflowLoading || updateMeta.isPending || generateRecibo.isPending || creatingEstampo || renderingEstampoPreview

  if (!notificacion) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Ejecución</h2>
            <button
              type="button"
              className="text-sm text-slate-500 hover:text-slate-700"
              onClick={onClose}
            >
              Cerrar
            </button>
          </header>
          <div className="mt-4 text-sm text-slate-700">
            Notificación no encontrada. Cierra y vuelve a abrir el wizard desde la tabla.
          </div>
        </div>
      </div>
    )
  }

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
                <label className="block font-medium text-slate-700" htmlFor="banco-recibo">
                  Banco *
                </label>
                <select
                  id="banco-recibo"
                  className="mt-1 w-full rounded border border-slate-300 p-2"
                  value={bancoId ?? ''}
                  onChange={event => {
                    setBancoId(event.target.value ? Number(event.target.value) : null)
                    setMontoManual(false)
                  }}
                >
                  <option value="">Seleccione un banco…</option>
                  {workflow?.bankContext.banks.map(bank => (
                    <option key={bank.id} value={bank.id}>{bank.nombre}</option>
                  ))}
                </select>
              </div>
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
                {workflowLoading ? (
                  <p className="mt-2 text-xs text-slate-400">Cargando estampos…</p>
                ) : (
                  <select
                    id="tipo-estampo"
                    className="mt-1 w-full rounded border border-slate-300 p-2"
                    value={
                      selectedEstampoTipo?.kind === 'WIZARD'
                        ? `wizard:${selectedEstampoTipo.categoria}`
                        : selectedEstampoTipo?.kind === 'CUSTOM'
                          ? `custom:${selectedEstampoTipo.estampoId}`
                          : ''
                    }
                    onChange={e => {
                      const value = e.target.value
                      setMontoManual(false)
                      if (value.startsWith('wizard:')) {
                        const categoria = value.replace('wizard:', '')
                        setSelectedEstampoTipo({ kind: 'WIZARD', categoria })
                      } else if (value.startsWith('custom:')) {
                        const estampoId = value.replace('custom:', '')
                        setSelectedEstampoTipo({ kind: 'CUSTOM', estampoId })
                      } else {
                        setSelectedEstampoTipo(null)
                      }
                    }}
                  >
                    <option value="">Seleccione un tipo de estampo…</option>
                    {workflow?.historicalSelection && (
                      <option
                        disabled
                        value={
                          workflow.historicalSelection.selection.kind === 'CUSTOM'
                            ? `custom:${workflow.historicalSelection.selection.estampoId}`
                            : `wizard:${workflow.historicalSelection.selection.categoria}`
                        }
                      >
                        {workflow.historicalSelection.label} (inactivo; solo histórico)
                      </option>
                    )}
                    {workflow?.estampoOptions.some(item => item.selection.kind === 'WIZARD') && (
                      <optgroup label="Wizard (Global)">
                        {workflow.estampoOptions
                          .filter(item => item.selection.kind === 'WIZARD')
                          .map(item => item.selection.kind === 'WIZARD' ? (
                            <option key={`wizard:${item.selection.categoria}`} value={`wizard:${item.selection.categoria}`}>
                              {item.label}
                            </option>
                          ) : null)}
                      </optgroup>
                    )}
                    {workflow?.estampoOptions.some(item => item.selection.kind === 'CUSTOM') && (
                      <optgroup label="Mis Estampos (Manuales)">
                        {workflow.estampoOptions
                          .filter(item => item.selection.kind === 'CUSTOM')
                          .map(item => item.selection.kind === 'CUSTOM' ? (
                            <option key={`custom:${item.selection.estampoId}`} value={`custom:${item.selection.estampoId}`}>
                              {item.label}
                            </option>
                          ) : null)}
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
                  onChange={e => {
                    setMonto(e.target.value)
                    setMontoManual(true)
                  }}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {selectedEstampoTipo?.kind === 'CUSTOM'
                    ? 'El monto se auto-completará si existe un arancel configurado.'
                    : 'Ingresa el monto manualmente.'}
                </p>
              </div>
              {workflow?.receiptState && (
                <div className="rounded border border-amber-200 bg-amber-50 p-3">
                  <label className="block font-medium text-slate-700" htmlFor="receipt-operation">
                    Recibo activo {workflow.receiptState.numeroRecibo}
                  </label>
                  <select
                    id="receipt-operation"
                    className="mt-1 w-full rounded border border-slate-300 bg-white p-2"
                    value={receiptOperation}
                    onChange={event => setReceiptOperation(event.target.value as 'REGENERATE' | 'CORRECT')}
                  >
                    <option value="REGENERATE">Regenerar el mismo recibo</option>
                    <option value="CORRECT">Corregir y emitir un nuevo número</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-600">
                    Regenerar conserva el número y solo admite los mismos datos legales.
                  </p>
                </div>
              )}
              {receiptOperation === 'CORRECT' && (
                <div>
                  <label className="block font-medium text-slate-700" htmlFor="correction-reason">
                    Motivo de corrección *
                  </label>
                  <textarea
                    id="correction-reason"
                    className="mt-1 h-20 w-full rounded border border-slate-300 p-2"
                    value={correctionReason}
                    onChange={event => setCorrectionReason(event.target.value)}
                    maxLength={500}
                  />
                </div>
              )}
            </>
          )}

          {/* Step III: Contenido Estampo (solo para legacy) */}
          {step === 3 && selectedEstampoTipo?.kind === 'CUSTOM' && (
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
                disabled={renderingEstampoPreview}
              />
              <p className="mt-1 text-xs text-slate-500">
                Puedes modificar el contenido antes de generar el PDF.
              </p>
            </div>
          )}
        </div>

        {errorMsg && <p className="mt-3 text-sm text-rose-600">{errorMsg}</p>}
        {workflowError && !errorMsg && (
          <p className="mt-3 text-sm text-rose-600">
            {workflowError instanceof Error ? workflowError.message : 'No se pudo cargar el flujo.'}
          </p>
        )}
        {successMsg && <p className="mt-3 text-sm text-emerald-600">{successMsg}</p>}

        <footer className="mt-6 flex flex-wrap justify-end gap-3">
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
                disabled={
                  isLoading || !bancoId || !selectedEstampoTipo || !monto ||
                  (receiptOperation === 'CORRECT' && correctionReason.trim().length < 3)
                }
              >
                {isLoading
                  ? 'Generando…'
                  : receiptOperation === 'CORRECT'
                    ? 'Emitir corrección'
                    : receiptOperation === 'REGENERATE'
                      ? 'Regenerar recibo'
                      : 'Generar recibo'}
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
                onClick={() => handleStepIIGenerate(true)}
                disabled={
                  isLoading || !bancoId || !selectedEstampoTipo || !monto ||
                  (receiptOperation === 'CORRECT' && correctionReason.trim().length < 3)
                }
              >
                {isLoading ? 'Generando…' : 'Guardar recibo y continuar'}
              </button>
            </>
          )}

          {/* Step III buttons (solo para legacy) */}
          {step === 3 && selectedEstampoTipo?.kind === 'CUSTOM' && (
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

