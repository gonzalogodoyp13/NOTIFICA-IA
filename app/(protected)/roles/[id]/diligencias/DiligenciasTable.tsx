import { useMemo, useState } from 'react'

import {
  useDiligencias,
  useDocumentos,
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

interface DiligenciaProgress {
  step1Done: boolean
  step2Done: boolean
  step3Done: boolean
  latestBoletaId: string | null
  latestEstampoId: string | null
}

function getDiligenciaProgress(
  diligencia: DiligenciaItem,
  documentos: DocumentoItem[]
): DiligenciaProgress {
  const meta = (diligencia.meta as Record<string, unknown> | null) ?? {}
  const step1Done = !!meta.fechaEjecucion

  // Filter documentos for this diligencia
  const diligenciaDocs = documentos.filter(
    doc => doc.diligencia?.id === diligencia.id && doc.pdfId
  )

  // Find latest Boleta (Recibo)
  const boletas = diligenciaDocs
    .filter(doc => doc.tipo === 'Recibo')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const step2Done = boletas.length > 0
  const latestBoletaId = step2Done ? boletas[0].id : null

  // Find latest Estampo - ensure strict filtering
  const estampos = diligenciaDocs
    .filter(doc => doc.tipo === 'Estampo')
    .filter(doc => doc.pdfId != null && doc.pdfId !== '') // Explicit null/empty check
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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

  const [showWizard, setShowWizard] = useState(false)
  const [ejecutarTarget, setEjecutarTarget] = useState<DiligenciaItem | null>(null)
  const [ejecutarInitialStep, setEjecutarInitialStep] = useState<1 | 2 | 3 | undefined>(undefined)
  const [flashMessage, setFlashMessage] = useState<string | null>(null)
  const [wizardModalOpen, setWizardModalOpen] = useState<{ diligenciaId: string; categoria: string } | null>(null)

  const sorted = useMemo(
    () =>
      (data ?? []).slice().sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }),
    [data]
  )

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
                const progress =
                  documentosLoading || documentosError
                    ? {
                        step1Done: false,
                        step2Done: false,
                        step3Done: false,
                        latestBoletaId: null,
                        latestEstampoId: null,
                      }
                    : getDiligenciaProgress(diligencia, documentos)

                const handleViewRecibo = (e: React.MouseEvent) => {
                  e.stopPropagation()
                  if (progress.latestBoletaId) {
                    window.open(`/api/documentos/${progress.latestBoletaId}/download?mode=inline`, '_blank')
                  }
                }

                const handleViewEstampo = (e: React.MouseEvent) => {
                  e.stopPropagation()
                  if (progress.latestEstampoId) {
                    window.open(`/api/documentos/${progress.latestEstampoId}/download?mode=inline`, '_blank')
                  }
                }

                const handleEjecutar = () => {
                  setEjecutarInitialStep(1)
                  setEjecutarTarget(diligencia)
                }

                const handleEditar = () => {
                  setEjecutarInitialStep(1)
                  setEjecutarTarget(diligencia)
                }

                const handleContinuarRecibo = () => {
                  setEjecutarInitialStep(2)
                  setEjecutarTarget(diligencia)
                }

                const handleContinuarEstampo = () => {
                  setEjecutarInitialStep(3)
                  setEjecutarTarget(diligencia)
                }

                return (
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
                        {/* State A: Step I NOT completed */}
                        {!progress.step1Done && (
                          <button
                            type="button"
                            onClick={handleEjecutar}
                            className="rounded border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                          >
                            Ejecutar
                          </button>
                        )}

                        {/* State B: Step I done, Boleta NOT generated */}
                        {progress.step1Done && !progress.step2Done && (
                          <>
                            <button
                              type="button"
                              onClick={handleEditar}
                              className="rounded border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={handleContinuarRecibo}
                              className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 transition hover:bg-blue-100"
                            >
                              Continuar con Recibo
                            </button>
                          </>
                        )}

                        {/* State C: Boleta generated, Estampo NOT generated */}
                        {progress.step2Done && !progress.step3Done && (
                          <>
                            <button
                              type="button"
                              onClick={handleEditar}
                              className="rounded border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={handleContinuarEstampo}
                              className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 transition hover:bg-blue-100"
                            >
                              Continuar con Estampo
                            </button>
                            {progress.latestBoletaId && (
                              <button
                                type="button"
                                onClick={handleViewRecibo}
                                className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 transition hover:bg-emerald-100"
                              >
                                Ver Recibo
                              </button>
                            )}
                          </>
                        )}

                        {/* State D: Both generated */}
                        {progress.step2Done && progress.step3Done && (
                          <>
                            <button
                              type="button"
                              onClick={handleEditar}
                              className="rounded border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                            >
                              Editar
                            </button>
                            {progress.latestBoletaId && (
                              <button
                                type="button"
                                onClick={handleViewRecibo}
                                className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 transition hover:bg-emerald-100"
                              >
                                Ver Recibo
                              </button>
                            )}
                            {progress.latestEstampoId && (
                              <button
                                type="button"
                                onClick={handleViewEstampo}
                                className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 transition hover:bg-emerald-100"
                              >
                                Ver Estampo
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
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
      {ejecutarTarget && (
        <EjecutarWizard
          rolId={rolId}
          diligencia={ejecutarTarget}
          initialStep={ejecutarInitialStep}
          onClose={() => {
            setEjecutarTarget(null)
            setEjecutarInitialStep(undefined)
          }}
          onSuccess={() => {
            setFlashMessage(`Ejecución completada para ${ejecutarTarget.tipo.nombre}.`)
            setEjecutarTarget(null)
            setEjecutarInitialStep(undefined)
          }}
          onOpenWizard={(diligenciaId, categoria) => {
            setWizardModalOpen({ diligenciaId, categoria })
          }}
        />
      )}
      {wizardModalOpen && (
        <EstampoWizardModal
          rolId={rolId}
          diligenciaId={wizardModalOpen.diligenciaId}
          categoria={wizardModalOpen.categoria}
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
    </section>
  )
}

