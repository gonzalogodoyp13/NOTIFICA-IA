'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, MapPin, Printer, X } from 'lucide-react'

import type { RolWorkspaceData } from '@/lib/hooks/useRolWorkspace'

type Ejecutado = NonNullable<NonNullable<RolWorkspaceData['demanda']>['ejecutados']>[number]
type Placement = '1' | '2' | '3' | '4' | '5' | '6'
type PageSize = 'oficio' | 'carta'

interface MembreteModalProps {
  rolId: string
  rolData: RolWorkspaceData
  onClose: () => void
}

const placements: Array<{ id: Placement; className: string }> = [
  { id: '1', className: 'left-[10%] top-[8%] h-[17%] w-[32%]' },
  { id: '2', className: 'right-[10%] top-[8%] h-[17%] w-[32%]' },
  { id: '3', className: 'left-[10%] bottom-[8%] h-[17%] w-[32%]' },
  { id: '4', className: 'right-[10%] bottom-[8%] h-[17%] w-[32%]' },
  { id: '5', className: 'left-[10%] top-[36%] h-[28%] w-[18%]' },
  { id: '6', className: 'right-[10%] top-[36%] h-[28%] w-[18%]' },
]

function formatAddress(ejecutado?: Ejecutado | null) {
  if (!ejecutado) return ''
  return [ejecutado.direccion, ejecutado.comuna?.nombre].filter(Boolean).join(', ')
}

export default function MembreteModal({ rolId, rolData, onClose }: MembreteModalProps) {
  const queryClient = useQueryClient()
  const ejecutados = useMemo(
    () => rolData.demanda?.ejecutados ?? [],
    [rolData.demanda?.ejecutados]
  )
  const [selectedEjecutadoId, setSelectedEjecutadoId] = useState(ejecutados[0]?.id ?? '')
  const [placement, setPlacement] = useState<Placement>('1')
  const [pageSize, setPageSize] = useState<PageSize>('oficio')
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    setSelectedEjecutadoId(ejecutados[0]?.id ?? '')
  }, [ejecutados])

  const selectedEjecutado = useMemo(
    () => ejecutados.find(item => item.id === selectedEjecutadoId) ?? null,
    [ejecutados, selectedEjecutadoId]
  )

  const address = formatAddress(selectedEjecutado)

  const handleGenerate = async () => {
    if (!selectedEjecutadoId) {
      setError('Selecciona un ejecutado antes de generar el documento.')
      return
    }

    const previewWindow = window.open('', '_blank')
    setError(null)
    setIsGenerating(true)

    try {
      const response = await fetch(`/api/roles/${rolId}/membrete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ejecutadoId: selectedEjecutadoId,
          placement,
          pageSize,
        }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || payload?.ok !== true || !payload?.data?.id) {
        throw new Error(
          (payload && typeof payload.error === 'string' && payload.error) ||
            'No fue posible generar el membrete.'
        )
      }

      queryClient.invalidateQueries({ queryKey: ['rol', rolId] })
      queryClient.invalidateQueries({ queryKey: ['rol', rolId, 'documentos'] })

      const url = `/api/documentos/${payload.data.id}/download?mode=inline`
      if (previewWindow) {
        previewWindow.location.href = url
      } else {
        window.open(url, '_blank')
      }
      onClose()
    } catch (generateError) {
      previewWindow?.close()
      setError(
        generateError instanceof Error
          ? generateError.message
          : 'No fue posible generar el membrete.'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_-38px_rgba(15,23,42,0.7)]">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Documento imprimible
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                Generar Membrete
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_310px]">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Listado de Ejecutados
              </label>
              <select
                value={selectedEjecutadoId}
                onChange={event => setSelectedEjecutadoId(event.target.value)}
                className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                {ejecutados.length === 0 && <option value="">Sin ejecutados registrados</option>}
                {ejecutados.map(ejecutado => (
                  <option key={ejecutado.id} value={ejecutado.id}>
                    {ejecutado.nombre}
                  </option>
                ))}
              </select>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <MapPin className="h-4 w-4 text-blue-700" />
                Direccion
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium leading-6 text-slate-800">
                {address || 'Sin direccion registrada para este ejecutado.'}
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Ubicacion en la hoja
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Elige el lugar donde se imprimira el membrete.
                  </p>
                </div>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  Zona {placement}
                </span>
              </div>

              <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="relative h-[260px] w-[170px] shrink-0 rounded-[22px] border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#eef4fb_100%)] shadow-inner">
                  {placements.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPlacement(item.id)}
                      className={`absolute ${item.className} rounded-xl border border-dashed text-lg font-bold transition ${
                        placement === item.id
                          ? 'border-blue-700 bg-blue-700 text-white shadow-lg'
                          : 'border-slate-400 bg-white/75 text-slate-800 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      {item.id}
                    </button>
                  ))}
                </div>

                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  {placements.map(item => (
                    <button
                      key={`option-${item.id}`}
                      type="button"
                      onClick={() => setPlacement(item.id)}
                      className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                        placement === item.id
                          ? 'border-blue-700 bg-blue-700 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-white'
                      }`}
                    >
                      Posicion {item.id}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-5 rounded-[24px] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_24px_60px_-42px_rgba(15,23,42,0.8)]">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                <FileText className="h-4 w-4" />
                Tamano de pagina
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(['oficio', 'carta'] as PageSize[]).map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPageSize(size)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold capitalize transition ${
                      pageSize === size
                        ? 'border-white bg-white text-slate-950'
                        : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-200">
              <div className="font-semibold text-white">{selectedEjecutado?.nombre ?? 'Ejecutado'}</div>
              <div className="mt-1 text-slate-300">{address || 'Sin direccion registrada'}</div>
              <div className="mt-3 text-slate-300">
                {rolData.tribunal?.nombre ?? 'Tribunal'} / {rolData.rol.numero}
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-300/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || !selectedEjecutadoId}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Generar Documento
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isGenerating}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
