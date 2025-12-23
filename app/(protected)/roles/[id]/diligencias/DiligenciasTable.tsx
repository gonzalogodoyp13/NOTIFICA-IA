import { useMemo, useState } from 'react'

import {
  useDiligencias,
  useDocumentos,
  useCreateNotificacion,
  useDeleteNotificacion,
  type DiligenciaItem,
  type DocumentoItem,
} from '@/lib/hooks/useRolWorkspace'

import EjecutarWizard from './EjecutarWizard'
import NuevaDiligenciaWizard from './NuevaDiligenciaWizard'
import EstampoWizardModal from './EstampoWizardModal'

interface DiligenciasTableProps {
  rolId: string
}

const estadoClases: Record<DiligenciaItem['estado'], string> = {
  pendiente: 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800',
  completada: 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800',
  fallida: 'rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800',
}

const TABLE_COLS = 4 // Tipo, Fecha encargo, Estado, Acciones

interface NotificacionProgress {
  step1Done: boolean
  step2Done: boolean
  step3Done: boolean
  latestBoletaId: string | null
  latestEstampoId: string | null
}

function getNotificacionProgress(
  diligencia: DiligenciaItem,
  notificacion: DiligenciaItem['notificaciones'][number],
  documentos: DocumentoItem[]
): NotificacionProgress {
  const meta = (notificacion.meta as Record<string, unknown> | null) ?? {}
  // Step 1 hoy escribe `fechaEjecucion` (legacy key) en notificacion.meta.
  // Mantener este check EXACTO; no cambiar a meta.ejecucion.* sin agregar fallback.
  const step1Done = !!meta.fechaEjecucion

  const docsForNotif = documentos
    .filter(doc => (doc.diligencia?.id ?? doc.diligenciaId) === diligencia.id)
    .filter(doc => doc.notificacionId === notificacion.id)
    .filter(doc => !!doc.pdfId)
    .filter((doc: any) => !doc.voidedAt)

  // Find latest Boleta (Recibo)
  const boletas = docsForNotif
    .filter(doc => doc.tipo === 'Recibo')
    .sort(
      (a, b) =>
        new Date((b as any).createdAt ?? 0).getTime() -
        new Date((a as any).createdAt ?? 0).getTime()
    )
  const step2Done = boletas.length > 0
  const latestBoletaId = step2Done ? boletas[0].id : null

  const estampos = docsForNotif
    .filter(doc => doc.tipo === 'Estampo')
    .sort(
      (a, b) =>
        new Date((b as any).createdAt ?? 0).getTime() -
        new Date((a as any).createdAt ?? 0).getTime()
    )
  const step3Done = estampos.length > 0
  const latestEstampoId = step3Done && estampos[0]?.id ? estampos[0].id : null

  return {
    step1Done,
    step2Done,
    step3Done,
    latestBoletaId,
    latestEstampoId,
  }
}

export default function DiligenciasTable({ rolId }: DiligenciasTableProps) {
  const { data, isLoading, isError, error, refetch: refetchDiligencias } = useDiligencias(rolId)
  const {
    data: documentos = [],
    isLoading: documentosLoading,
    isError: documentosError,
    refetch: refetchDocumentos,
  } = useDocumentos(rolId)

  const createNotificacion = useCreateNotificacion(rolId)
  const deleteNotificacion = useDeleteNotificacion(rolId)
  const [creatingDiligenciaId, setCreatingDiligenciaId] = useState<string | null>(null)

  const [showWizard, setShowWizard] = useState(false)
  const [ejecutarTarget, setEjecutarTarget] = useState<DiligenciaItem | null>(null)
  const [ejecutarNotificacionId, setEjecutarNotificacionId] = useState<string | null>(null)
  const [ejecutarInitialStep, setEjecutarInitialStep] = useState<1 | 2 | 3 | undefined>(undefined)
  const [flashMessage, setFlashMessage] = useState<string | null>(null)
  const [wizardModalOpen, setWizardModalOpen] = useState<{
    diligenciaId: string
    categoria: string
    notificacionId: string
  } | null>(null)
  const [ejecutadoModalOpen, setEjecutadoModalOpen] = useState<{
    diligenciaId: string
    ejecutados: Array<{ id: string; nombre: string; direccion: string }>
  } | null>(null)
  const [selectedEjecutadoId, setSelectedEjecutadoId] = useState<string>('')

  const sorted = useMemo(
    () =>
      (data ?? []).slice().sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }),
    [data]
  )

  const handleCreateNotificacion = (diligencia: DiligenciaItem) => {
    const ejecutados = diligencia.ejecutados ?? []
    const ejecutadosCount = ejecutados.length

    if (ejecutadosCount === 0) {
      setFlashMessage('No se puede crear notificación: la demanda no tiene ejecutados registrados.')
      return
    }

    if (ejecutadosCount === 1) {
      // Auto-create with the only ejecutado
      setCreatingDiligenciaId(diligencia.id)
      createNotificacion.mutate(
        { diligenciaId: diligencia.id, ejecutadoId: ejecutados[0].id },
        {
          onSuccess: () => {
            setFlashMessage('Nueva notificación creada.')
            setCreatingDiligenciaId(null)
          },
          onError: (err) => {
            console.error('Error creando notificación:', err)
            setFlashMessage(err.message || 'Error al crear notificación. Intenta nuevamente.')
            setCreatingDiligenciaId(null)
          },
        }
      )
    } else {
      // Multiple ejecutados: open modal
      setEjecutadoModalOpen({
        diligenciaId: diligencia.id,
        ejecutados: ejecutados,
      })
      setSelectedEjecutadoId('')
    }
  }

  const handleConfirmEjecutadoSelection = () => {
    if (!ejecutadoModalOpen || !selectedEjecutadoId) return

    setCreatingDiligenciaId(ejecutadoModalOpen.diligenciaId)
    createNotificacion.mutate(
      { diligenciaId: ejecutadoModalOpen.diligenciaId, ejecutadoId: selectedEjecutadoId },
      {
        onSuccess: () => {
          setFlashMessage('Nueva notificación creada.')
          setCreatingDiligenciaId(null)
          setEjecutadoModalOpen(null)
          setSelectedEjecutadoId('')
        },
        onError: (err) => {
          console.error('Error creando notificación:', err)
          setFlashMessage(err.message || 'Error al crear notificación. Intenta nuevamente.')
          setCreatingDiligenciaId(null)
        },
      }
    )
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Diligencias</h2>
          {isLoading && (
            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 animate-ping rounded-full bg-slate-400" />
              Cargando...
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <span className="text-base leading-none">＋</span>
          Nueva diligencia
        </button>
      </header>

      {flashMessage && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          {flashMessage}
        </div>
      )}

      {isError && (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Error al obtener las diligencias: {error?.message ?? 'intenta nuevamente.'}
        </p>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Aún no se han registrado diligencias para este ROL.
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100 text-left text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Fecha encargo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {isLoading &&
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="animate-pulse">
                  <td className="px-4 py-4">
                    <span className="inline-block h-4 w-32 rounded bg-slate-200" />
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-block h-4 w-24 rounded bg-slate-200" />
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-block h-4 w-16 rounded-full bg-slate-200" />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="inline-block h-8 w-32 rounded bg-slate-200" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              !isError &&
              sorted.map(diligencia => {
                const handleViewDocumento = (e: React.MouseEvent, documentoId: string) => {
                  e.stopPropagation()
                  window.open(`/api/documentos/${documentoId}/download?mode=inline`, '_blank')
                }

                const openWizardForNotificacion = (
                  notificacionId: string,
                  step: 1 | 2 | 3
                ) => {
                  setEjecutarTarget(diligencia)
                  setEjecutarNotificacionId(notificacionId)
                  setEjecutarInitialStep(step)
                }

                // Sort notificaciones for stable ordering
                const notificaciones = (diligencia.notificaciones || []).slice().sort((a, b) => {
                  // Primary: createdAt ascending (nulls last)
                  const aDate = a.createdAt ? new Date(a.createdAt).getTime() : Infinity
                  const bDate = b.createdAt ? new Date(b.createdAt).getTime() : Infinity
                  
                  if (aDate !== bDate) {
                    return aDate - bDate
                  }
                  
                  // Tie-break: id ascending (string comparison)
                  return a.id.localeCompare(b.id)
                })

                return (
                  <>
                    <tr key={diligencia.id}>
                      <td className="px-4 py-3 text-slate-800">
                        <div className="font-medium">{diligencia.tipo.nombre}</div>
                        {diligencia.tipo.descripcion && (
                          <div className="text-xs text-slate-500">{diligencia.tipo.descripcion}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {new Date(diligencia.fecha).toLocaleString('es-CL')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={estadoClases[diligencia.estado]}>{diligencia.estado}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 text-xs">
                          {/* Botón "Nueva notificación" - siempre visible */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCreateNotificacion(diligencia)
                            }}
                            disabled={creatingDiligenciaId === diligencia.id}
                            className="rounded border border-purple-200 bg-purple-50 px-3 py-1 text-purple-700 transition hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {creatingDiligenciaId === diligencia.id ? 'Creando...' : 'Nueva notificación'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Filas anidadas para notificaciones */}
                    {notificaciones.length > 0 ? (
                      notificaciones
                        .filter((notif: any) => !notif.voidedAt)
                        .map((notif, idx) => {
                        const notifProgress: NotificacionProgress =
                          documentosLoading || documentosError
                            ? {
                                step1Done: false,
                                step2Done: false,
                                step3Done: false,
                                latestBoletaId: null,
                                latestEstampoId: null,
                              }
                            : getNotificacionProgress(diligencia, notif, documentos)

                        const meta = (notif.meta as Record<string, any> | null) ?? {}
                        const estampoTipo = meta?.estampoTipo
                        const isEstampoTipoObject =
                          !!estampoTipo && typeof estampoTipo === 'object' && !Array.isArray(estampoTipo)

                        const isWizard =
                          isEstampoTipoObject &&
                          (estampoTipo as any).kind === 'WIZARD' &&
                          typeof (estampoTipo as any).categoria === 'string' &&
                          (estampoTipo as any).categoria.length > 0

                        return (
                          <tr key={notif.id} className="bg-slate-50">
                            <td colSpan={TABLE_COLS} className="px-4 py-2">
                              <div className="flex items-center gap-3 pl-8 text-sm">
                                <span className="font-medium text-slate-700">
                                  Notificación — {notif.id.slice(0, 6)}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {notif.createdAt
                                    ? new Date(notif.createdAt).toLocaleString('es-CL')
                                    : '—'}
                                </span>
                                {/* DEBUG: Remove after confirming */}
                                <span className="text-xs text-slate-400 font-mono">
                                  [ID: {notif.id.slice(0, 6)} | Boleta: {notifProgress.latestBoletaId?.slice(0, 6) ?? '—'} | Estampo: {notifProgress.latestEstampoId?.slice(0, 6) ?? '—'}]
                                </span>
                                {!notif.ejecutadoId && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                    Requiere selección
                                  </span>
                                )}
                                <div className="ml-auto flex items-center gap-2 text-xs">
                                  {!notifProgress.step1Done && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openWizardForNotificacion(notif.id, 1)
                                    }}
                                    className="rounded border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                                  >
                                    Ejecutar
                                  </button>
                                )}

                                {notifProgress.step1Done && !notifProgress.step2Done && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openWizardForNotificacion(notif.id, 1)
                                      }}
                                      className="rounded border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openWizardForNotificacion(notif.id, 2)
                                      }}
                                      className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 transition hover:bg-blue-100"
                                    >
                                      Continuar con Recibo
                                    </button>
                                  </>
                                )}

                                {notifProgress.step2Done && !notifProgress.step3Done && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openWizardForNotificacion(notif.id, 1)
                                      }}
                                      className="rounded border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (isWizard) {
                                          const categoria = (estampoTipo as any).categoria as string
                                          setWizardModalOpen({
                                            diligenciaId: diligencia.id,
                                            categoria,
                                            notificacionId: notif.id,
                                          })
                                        } else {
                                          openWizardForNotificacion(notif.id, 3)
                                        }
                                      }}
                                      className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 transition hover:bg-blue-100"
                                    >
                                      Continuar con Estampo
                                    </button>
                                    {notifProgress.latestBoletaId && (
                                      <button
                                        type="button"
                                        onClick={(e) =>
                                          handleViewDocumento(e, notifProgress.latestBoletaId!)
                                        }
                                        className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 transition hover:bg-emerald-100"
                                      >
                                        Ver Recibo
                                      </button>
                                    )}
                                  </>
                                )}

                                {notifProgress.step2Done && notifProgress.step3Done && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openWizardForNotificacion(notif.id, 1)
                                      }}
                                      className="rounded border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                                    >
                                      Editar
                                    </button>
                                    {notifProgress.latestBoletaId && (
                                      <button
                                        type="button"
                                        onClick={(e) =>
                                          handleViewDocumento(e, notifProgress.latestBoletaId!)
                                        }
                                        className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 transition hover:bg-emerald-100"
                                      >
                                        Ver Recibo
                                      </button>
                                    )}
                                    {notifProgress.latestEstampoId && (
                                      <button
                                        type="button"
                                        onClick={(e) =>
                                          handleViewDocumento(e, notifProgress.latestEstampoId!)
                                        }
                                        className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 transition hover:bg-emerald-100"
                                      >
                                        Ver Estampo
                                      </button>
                                    )}
                                  </>
                                )}

                                  {!notif.voidedAt && (
                                    <button
                                      type="button"
                                      disabled={documentosLoading || deleteNotificacion.isPending}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (documentosLoading) return
                                        const ok = window.confirm(
                                          '¿Anular esta notificación? Los documentos asociados también serán anulados y ocultados de la vista normal. Esta acción puede revertirse en el futuro para auditoría.'
                                        )
                                        if (!ok) return

                                        deleteNotificacion.mutate(
                                          { diligenciaId: diligencia.id, notificacionId: notif.id },
                                          {
                                            onSuccess: () => {
                                              setFlashMessage('Notificación anulada.')
                                            },
                                            onError: (err) => {
                                              setFlashMessage(err.message || 'Error al anular notificación')
                                            },
                                          }
                                        )
                                      }}
                                      className="rounded border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Anular
                                    </button>
                                  )}
                              </div>
                            </div>
                          </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr className="bg-slate-50">
                        <td colSpan={TABLE_COLS} className="px-4 py-2">
                          <div className="flex items-center gap-3 pl-8 text-sm">
                            <span className="text-slate-500">Sin ciclos de ejecución</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCreateNotificacion(diligencia)
                              }}
                              disabled={creatingDiligenciaId === diligencia.id}
                              className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {creatingDiligenciaId === diligencia.id ? 'Creando...' : 'Nueva notificación'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
          </tbody>
        </table>
      </div>

      {showWizard && (
        <NuevaDiligenciaWizard
          rolId={rolId}
          onClose={() => setShowWizard(false)}
          onCreated={() => setFlashMessage('Diligencia creada correctamente.')}
        />
      )}
      {ejecutarTarget && ejecutarNotificacionId && (
        <EjecutarWizard
          rolId={rolId}
          diligencia={ejecutarTarget}
          notificacionId={ejecutarNotificacionId}
          initialStep={ejecutarInitialStep}
          onClose={() => {
            setEjecutarTarget(null)
            setEjecutarNotificacionId(null)
            setEjecutarInitialStep(undefined)
          }}
          onSuccess={() => {
            setFlashMessage(`Ejecución completada para ${ejecutarTarget.tipo.nombre}.`)
            setEjecutarTarget(null)
            setEjecutarNotificacionId(null)
            setEjecutarInitialStep(undefined)
          }}
          onOpenWizard={(diligenciaId, categoria, notificacionId) => {
            setWizardModalOpen({ diligenciaId, categoria, notificacionId })
          }}
        />
      )}
      {wizardModalOpen && (
        <EstampoWizardModal
          rolId={rolId}
          diligenciaId={wizardModalOpen.diligenciaId}
          categoria={wizardModalOpen.categoria}
          notificacionId={wizardModalOpen.notificacionId}
          isOpen={true}
          onClose={() => setWizardModalOpen(null)}
          onSuccess={() => {
            refetchDiligencias()
            refetchDocumentos()
            setFlashMessage('Estampo generado correctamente.')
            setWizardModalOpen(null)
          }}
        />
      )}
      {ejecutadoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              Seleccionar Ejecutado
            </h3>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Ejecutado *
              </label>
              <select
                value={selectedEjecutadoId}
                onChange={(e) => setSelectedEjecutadoId(e.target.value)}
                className="w-full rounded border border-slate-300 p-2 text-sm"
              >
                <option value="">Seleccione un ejecutado...</option>
                {ejecutadoModalOpen.ejecutados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} — {e.direccion}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEjecutadoModalOpen(null)
                  setSelectedEjecutadoId('')
                }}
                className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmEjecutadoSelection}
                disabled={!selectedEjecutadoId || creatingDiligenciaId === ejecutadoModalOpen.diligenciaId}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

