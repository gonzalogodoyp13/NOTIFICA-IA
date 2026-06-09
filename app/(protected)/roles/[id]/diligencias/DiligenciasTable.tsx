import { useMemo, useState, type MouseEvent } from 'react'
import { useCreateNotificacion, useDeleteNotificacion, useDiligencias, type DiligenciaItem, type NotificacionItem } from '@/lib/hooks/useRolWorkspace'
import EjecutarWizard from './EjecutarWizard'
import EstampoWizardModal from './EstampoWizardModal'
import NuevaDiligenciaWizard from './NuevaDiligenciaWizard'

interface DiligenciasTableProps { rolId: string }

type VisibleNotificacion = NotificacionItem & {
  _estampoLabel: string
  _ejecutadoNombre: string
  _ejecutadoDireccion: string
  _isWizard: boolean
  _wizardCategoria: string | null
}

const shellClass =
  'rounded-[24px] border border-sky-200 bg-[linear-gradient(180deg,#f8fcff_0%,#eaf5ff_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(30,64,175,0.2)]'
const blockClass =
  'overflow-hidden rounded-[24px] border border-sky-200 bg-white shadow-[0_18px_45px_-40px_rgba(30,64,175,0.18)]'
const sectionHeaderClass =
  'text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-700/70'
const subtleCellClass = 'bg-[linear-gradient(180deg,#f8fbff_0%,#edf6ff_100%)] px-5 py-4'
const bodyCellClass = 'bg-white px-5 py-5'
const primaryButtonClass =
  'inline-flex items-center justify-center rounded-full border border-sky-700 bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButtonClass =
  'inline-flex items-center justify-center rounded-full border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50'
const accentButtonClass =
  'inline-flex items-center justify-center rounded-full border border-sky-300 bg-sky-100 px-4 py-2.5 text-sm font-semibold text-sky-900 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50'
const successButtonClass =
  'inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50'
const dangerButtonClass =
  'inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50'

function getWorkflowStatusLabel(status: NotificacionItem['workflowStatus']) {
  switch (status) {
    case 'ejecutada':
      return 'Ejecutada'
    case 'recibo_generado':
      return 'Recibo generado'
    case 'nueva':
    default:
      return 'Nueva'
  }
}

function getWorkflowStatusClass(status: NotificacionItem['workflowStatus']) {
  switch (status) {
    case 'ejecutada':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'recibo_generado':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'nueva':
    default:
      return 'border-slate-200 bg-white text-slate-600'
  }
}

export default function DiligenciasTable({ rolId }: DiligenciasTableProps) {
  const { data, isLoading, isError, error } = useDiligencias(rolId)
  const createNotificacion = useCreateNotificacion(rolId)
  const deleteNotificacion = useDeleteNotificacion(rolId)
  const [creatingDiligenciaId, setCreatingDiligenciaId] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [ejecutarTarget, setEjecutarTarget] = useState<DiligenciaItem | null>(null)
  const [ejecutarNotificacionId, setEjecutarNotificacionId] = useState<string | null>(null)
  const [ejecutarInitialStep, setEjecutarInitialStep] = useState<1 | 2 | 3 | undefined>(undefined)
  const [flashMessage, setFlashMessage] = useState<string | null>(null)
  const [wizardModalOpen, setWizardModalOpen] = useState<{ diligenciaId: string; categoria: string; notificacionId: string } | null>(null)
  const [ejecutadoModalOpen, setEjecutadoModalOpen] = useState<{ diligenciaId: string; ejecutados: Array<{ id: string; nombre: string; direccion: string }>; startImmediately?: boolean } | null>(null)
  const [selectedEjecutadoId, setSelectedEjecutadoId] = useState('')

  const sorted = useMemo(() => (data ?? []).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [data])

  const handleViewDocumento = (event: MouseEvent, documentoId: string) => {
    event.stopPropagation()
    window.open(`/api/documentos/${documentoId}/download?mode=inline`, '_blank')
  }

  const openWizardForNotificacion = (diligencia: DiligenciaItem, notificacionId: string, step: 1 | 2 | 3) => {
    setEjecutarTarget(diligencia)
    setEjecutarNotificacionId(notificacionId)
    setEjecutarInitialStep(step)
  }

  const openEstampoEditor = (diligencia: DiligenciaItem, notif: VisibleNotificacion) => {
    if (notif._isWizard && notif._wizardCategoria) {
      setWizardModalOpen({ diligenciaId: diligencia.id, categoria: notif._wizardCategoria, notificacionId: notif.id })
      return
    }
    openWizardForNotificacion(diligencia, notif.id, 3)
  }

  const createNotificacionForDiligencia = (diligencia: DiligenciaItem, options?: { startImmediately?: boolean; ejecutadoId?: string }) => {
    const ejecutados = diligencia.ejecutados ?? []
    const startImmediately = options?.startImmediately ?? false
    if (ejecutados.length === 0) {
      setFlashMessage('No se puede crear notificacion: la demanda no tiene ejecutados registrados.')
      return
    }

    const finalizeCreate = (ejecutadoId?: string) => {
      setCreatingDiligenciaId(diligencia.id)
      createNotificacion.mutate(
        { diligenciaId: diligencia.id, ejecutadoId },
        {
          onSuccess: createdNotificacion => {
            setFlashMessage(startImmediately ? 'Ejecucion iniciada.' : 'Nueva notificacion creada.')
            setCreatingDiligenciaId(null)
            if (startImmediately) openWizardForNotificacion(diligencia, createdNotificacion.id, 1)
          },
          onError: mutationError => {
            console.error('Error creando notificacion:', mutationError)
            setFlashMessage(mutationError.message || 'Error al crear notificacion. Intenta nuevamente.')
            setCreatingDiligenciaId(null)
          },
        }
      )
    }

    if (options?.ejecutadoId) return finalizeCreate(options.ejecutadoId)
    if (ejecutados.length === 1) return finalizeCreate(ejecutados[0].id)
    setEjecutadoModalOpen({ diligenciaId: diligencia.id, ejecutados, startImmediately })
    setSelectedEjecutadoId('')
  }

  const handleConfirmEjecutadoSelection = () => {
    if (!ejecutadoModalOpen || !selectedEjecutadoId) return
    const diligencia = sorted.find(item => item.id === ejecutadoModalOpen.diligenciaId)
    if (!diligencia) {
      setFlashMessage('No fue posible encontrar la diligencia seleccionada.')
      setEjecutadoModalOpen(null)
      setSelectedEjecutadoId('')
      return
    }
    setEjecutadoModalOpen(null)
    createNotificacionForDiligencia(diligencia, { ejecutadoId: selectedEjecutadoId, startImmediately: ejecutadoModalOpen.startImmediately })
    setSelectedEjecutadoId('')
  }

  const renderActionButton = (label: string, onClick: (event: MouseEvent<HTMLButtonElement>) => void, className: string, disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>{label}</button>
  )

  return (
    <section className={shellClass}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-700/80">
            Panel operativo
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Diligencias</h2>
            {isLoading && (
              <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                <span className="h-2 w-2 animate-ping rounded-full bg-slate-400" />
                Cargando...
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            Cada diligencia vive en su propio bloque para que ejecutar, recibo y estampo se lean de un vistazo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className={primaryButtonClass}
        >
          <span className="text-base leading-none">+</span>
          Nueva diligencia
        </button>
      </header>

      {flashMessage && (
        <div className="mt-5 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {flashMessage}
        </div>
      )}

      {isError && (
        <p className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Error al obtener las diligencias: {error?.message ?? 'intenta nuevamente.'}
        </p>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="mt-5 rounded-[22px] border border-dashed border-sky-300 bg-white/75 px-6 py-10 text-center">
          <p className="text-base font-semibold text-slate-800">Aun no se han registrado diligencias para este ROL.</p>
          <p className="mt-2 text-sm text-slate-500">
            Crea la primera diligencia para empezar a ejecutar, generar recibos y trabajar estampos.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className={blockClass}
            >
              <div className="grid animate-pulse gap-px bg-slate-200 md:grid-cols-[1.4fr_1fr_0.9fr]">
                <div className={subtleCellClass}>
                  <span className="mb-2 inline-block h-3 w-16 rounded-full bg-slate-200" />
                  <span className="block h-5 w-40 rounded bg-slate-200" />
                </div>
                <div className={subtleCellClass}>
                  <span className="mb-2 inline-block h-3 w-24 rounded-full bg-slate-200" />
                  <span className="block h-5 w-32 rounded bg-slate-200" />
                </div>
                <div className={subtleCellClass}>
                  <span className="mb-2 inline-block h-3 w-20 rounded-full bg-slate-200" />
                  <span className="block h-10 w-32 rounded-full bg-slate-200" />
                </div>
              </div>
              <div className="grid animate-pulse gap-px border-t border-slate-200 bg-slate-200 md:grid-cols-[1fr_1.4fr]">
                <div className={bodyCellClass}>
                  <span className="mb-2 inline-block h-3 w-20 rounded-full bg-slate-200" />
                  <span className="block h-5 w-36 rounded bg-slate-200" />
                  <span className="mt-2 block h-4 w-48 rounded bg-slate-200" />
                </div>
                <div className={bodyCellClass}>
                  <span className="mb-3 inline-block h-3 w-24 rounded-full bg-slate-200" />
                  <span className="block h-10 w-52 rounded-2xl bg-slate-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && sorted.length > 0 && (
        <div className="mt-6 space-y-4">
          {sorted.map(diligencia => {
            const notificaciones: VisibleNotificacion[] = (diligencia.notificaciones || [])
              .filter(notif => !notif.voidedAt)
              .slice()
              .sort((a, b) => {
                const aDate = a.createdAt ? new Date(a.createdAt).getTime() : Infinity
                const bDate = b.createdAt ? new Date(b.createdAt).getTime() : Infinity
                if (aDate !== bDate) return aDate - bDate
                return a.id.localeCompare(b.id)
              })
              .map(notif => {
                const meta = (notif.meta as Record<string, unknown> | null) ?? {}
                const estampoTipo = meta.estampoTipo
                const isEstampoTipoObject =
                  !!estampoTipo && typeof estampoTipo === 'object' && !Array.isArray(estampoTipo)
                const isWizard =
                  isEstampoTipoObject &&
                  (estampoTipo as { kind?: string }).kind === 'WIZARD' &&
                  typeof (estampoTipo as { categoria?: string }).categoria === 'string' &&
                  ((estampoTipo as { categoria?: string }).categoria?.length ?? 0) > 0
                const ejecutado = diligencia.ejecutados.find(item => item.id === notif.ejecutadoId)

                return {
                  ...notif,
                  _estampoLabel:
                    notif.latestEstampo?.nombreVisible ?? notif.latestEstampo?.slug ?? 'Sin estampo',
                  _ejecutadoNombre: ejecutado?.nombre ?? 'Ejecutado pendiente',
                  _ejecutadoDireccion:
                    ejecutado?.direccion ?? 'Selecciona el ejecutado para continuar con el flujo.',
                  _isWizard: isWizard,
                  _wizardCategoria: isWizard
                    ? ((estampoTipo as { categoria?: string }).categoria ?? null)
                    : null,
                }
              })
            const hasNotificaciones = notificaciones.length > 0
            const isCreating = creatingDiligenciaId === diligencia.id

            return (
              <article
                key={diligencia.id}
                className={blockClass}
              >
                <div className="grid gap-px bg-slate-200 md:grid-cols-[1.45fr_1fr_0.95fr]">
                  <div className={subtleCellClass}>
                    <div className={sectionHeaderClass}>Tipo</div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <div>
                        <div className="text-xl font-semibold tracking-tight text-slate-900">{diligencia.tipo.nombre}</div>
                        {diligencia.tipo.descripcion && (
                          <div className="mt-1 text-sm text-slate-500">{diligencia.tipo.descripcion}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={subtleCellClass}>
                    <div className={sectionHeaderClass}>Fecha Encargo</div>
                    <div className="mt-2 text-base font-semibold text-slate-800">
                      {new Date(diligencia.fecha).toLocaleDateString('es-CL')}
                    </div>
                  </div>
                  <div className={subtleCellClass}>
                    <div className={sectionHeaderClass}>Acciones</div>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      {!hasNotificaciones ? (
                        <button
                          type="button"
                          onClick={() => createNotificacionForDiligencia(diligencia, { startImmediately: true })}
                          disabled={isCreating}
                          className={`${primaryButtonClass} min-h-12 px-5`}
                        >
                          {isCreating ? 'Preparando...' : 'Ejecutar'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => createNotificacionForDiligencia(diligencia)}
                          disabled={isCreating}
                          className={secondaryButtonClass}
                        >
                          {isCreating ? 'Creando...' : 'Nueva Notificacion'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {hasNotificaciones ? (
                  <div className="border-t border-slate-200">
                    <div className="grid gap-px bg-slate-200 md:grid-cols-[0.95fr_1.55fr]">
                      <div className="bg-sky-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700/70">Ejecutado</div>
                      <div className="bg-sky-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700/70">Acciones</div>
                    </div>
                    {notificaciones.map((notif, index) => {
                      const hasReciboPdf =
                        notif.workflowStatus === 'recibo_generado' ||
                        notif.workflowStatus === 'ejecutada'
                      const hasCompletedCycle = notif.workflowStatus === 'ejecutada'

                      return (
                        <div key={notif.id} className={`grid gap-px bg-slate-200 md:grid-cols-[0.95fr_1.55fr] ${index === 0 ? '' : 'border-t border-slate-200'}`}>
                        <div className={`${bodyCellClass} flex h-full flex-col`}>
                          <div className="text-[1.15rem] font-semibold text-slate-900">{notif._ejecutadoNombre}</div>
                          <div className="mt-1 text-[0.98rem] leading-7 text-slate-500">{notif._ejecutadoDireccion}</div>
                          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>{notif.createdAt ? new Date(notif.createdAt).toLocaleString('es-CL') : 'Sin fecha de creacion'}</span>
                            <span className={`rounded-full border px-2 py-1 font-medium ${getWorkflowStatusClass(notif.workflowStatus)}`}>
                              {getWorkflowStatusLabel(notif.workflowStatus)}
                            </span>
                          </div>
                          <div className="mt-auto pt-5">
                            {renderActionButton('Anular Notificacion', event => {
                              event.stopPropagation()
                              const ok = window.confirm('Anular esta notificacion? Se eliminara de la tabla junto con sus recibos y estampos asociados.')
                              if (!ok) return
                              deleteNotificacion.mutate(
                                { diligenciaId: diligencia.id, notificacionId: notif.id },
                                { onSuccess: () => setFlashMessage('Notificacion anulada.'), onError: mutationError => setFlashMessage(mutationError.message || 'Error al anular notificacion') }
                              )
                            }, dangerButtonClass, deleteNotificacion.isPending)}
                          </div>
                        </div>
                        <div className={bodyCellClass}>
                          {!notif.step1Done && (
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700/70">Acciones</div>
                                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Inicia la ejecucion de esta diligencia para capturar la visita y habilitar el recibo.</p>
                              </div>
                              {renderActionButton('Ejecutar', event => { event.stopPropagation(); openWizardForNotificacion(diligencia, notif.id, 1) }, `${accentButtonClass} min-h-12 px-5`)}
                            </div>
                          )}
                          {notif.step1Done && !hasReciboPdf && (
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700/70">Acciones</div>
                                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">La ejecucion ya esta registrada. Continua con el recibo o vuelve a editar los datos previos.</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {renderActionButton('Editar ejecucion', event => { event.stopPropagation(); openWizardForNotificacion(diligencia, notif.id, 1) }, secondaryButtonClass)}
                                {renderActionButton('Continuar con recibo', event => { event.stopPropagation(); openWizardForNotificacion(diligencia, notif.id, 2) }, primaryButtonClass)}
                              </div>
                            </div>
                          )}
                          {hasReciboPdf && (
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="rounded-[20px] border border-sky-200 bg-[linear-gradient(180deg,#f8fcff_0%,#eaf5ff_100%)] p-4">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700/70">For Estampo</div>
                                {!hasCompletedCycle ? (
                                  <>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">El recibo ya fue generado. Ahora puedes continuar con el estampo de esta diligencia.</p>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      {renderActionButton('Continuar con estampo', event => { event.stopPropagation(); openEstampoEditor(diligencia, notif) }, accentButtonClass)}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="mt-2 text-lg font-semibold text-slate-900">{notif._estampoLabel}</div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      {notif.latestEstampoId && renderActionButton('Ver estampo', event => handleViewDocumento(event, notif.latestEstampoId!), successButtonClass)}
                                      {renderActionButton('Editar', event => { event.stopPropagation(); openEstampoEditor(diligencia, notif) }, secondaryButtonClass)}
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="rounded-[20px] border border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#f2f8ff_100%)] p-4">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700/70">Recibo</div>
                                <p className="mt-2 text-sm leading-6 text-slate-600">El recibo ya forma parte del flujo. Puedes verlo o volver al paso correspondiente.</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {renderActionButton('Editar recibo', event => { event.stopPropagation(); openWizardForNotificacion(diligencia, notif.id, 2) }, secondaryButtonClass)}
                                  {notif.latestReciboId && renderActionButton('Ver recibo', event => handleViewDocumento(event, notif.latestReciboId!), successButtonClass)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="grid gap-px border-t border-slate-200 bg-slate-200 md:grid-cols-[0.95fr_1.55fr]">
                    <div className="bg-sky-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700/70">Ejecutado</div>
                    <div className="bg-sky-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700/70">Acciones</div>
                    <div className={bodyCellClass}><div className="text-lg font-semibold text-slate-700">Sin ciclo creado</div><div className="mt-1 text-sm leading-6 text-slate-500">El ejecutado se asociara cuando inicies la ejecucion de esta diligencia.</div></div>
                    <div className={bodyCellClass}><div className="rounded-[20px] border border-dashed border-sky-300 bg-sky-50 px-4 py-4"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700/70">Acciones</div><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Todavia no existe un ciclo para esta diligencia. Usa el boton superior para ejecutar y abrir el flujo normal.</p></div></div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

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
            setFlashMessage(`Ejecucion completada para ${ejecutarTarget.tipo.nombre}.`)
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
            setFlashMessage('Estampo generado correctamente.')
            setWizardModalOpen(null)
          }}
        />
      )}

      {ejecutadoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[24px] border border-sky-200 bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">Seleccionar Ejecutado</h3>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">Ejecutado *</label>
              <select
                value={selectedEjecutadoId}
                onChange={event => setSelectedEjecutadoId(event.target.value)}
                className="w-full rounded-[18px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:bg-white"
              >
                <option value="">Seleccione un ejecutado...</option>
                {ejecutadoModalOpen.ejecutados.map(ejecutado => (
                  <option key={ejecutado.id} value={ejecutado.id}>
                    {ejecutado.nombre} - {ejecutado.direccion}
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
                className={secondaryButtonClass}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmEjecutadoSelection}
                disabled={!selectedEjecutadoId || creatingDiligenciaId === ejecutadoModalOpen.diligenciaId}
                className={primaryButtonClass}
              >
                {ejecutadoModalOpen.startImmediately ? 'Crear y ejecutar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
