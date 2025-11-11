import { useMemo } from 'react'

import { useRolStateBadge, type RolWorkspaceData } from '@/lib/hooks/useRolWorkspace'

interface RolHeaderProps {
  data?: RolWorkspaceData
  isLoading: boolean
}

export default function RolHeader({ data, isLoading }: RolHeaderProps) {
  const estadoBadgeClass = useRolStateBadge(data?.rol.estado)

  const ultimaActividad = useMemo(() => {
    if (!data?.ultimaActividad) return null
    const date = new Date(data.ultimaActividad)
    return new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }, [data?.ultimaActividad])

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Ficha Interna del ROL</div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              {isLoading ? (
                <span className="inline-block h-6 w-32 animate-pulse rounded bg-slate-200" />
              ) : (
                data?.rol.numero ?? '—'
              )}
            </h1>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${estadoBadgeClass}`}>
              {isLoading ? (
                <span className="inline-block h-3 w-12 animate-pulse rounded bg-slate-200" />
              ) : (
                data?.rol.estado.replace('_', ' ') ?? 'sin estado'
              )}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
            <div>
              <span className="font-medium text-slate-700">Tribunal: </span>
              {isLoading ? (
                <span className="inline-block h-4 w-28 animate-pulse rounded bg-slate-200" />
              ) : (
                data?.tribunal?.nombre ?? 'No asignado'
              )}
            </div>
            <div>
              <span className="font-medium text-slate-700">Abogado: </span>
              {isLoading ? (
                <span className="inline-block h-4 w-28 animate-pulse rounded bg-slate-200" />
              ) : (
                data?.abogado?.nombre ?? 'No registrado'
              )}
            </div>
            {ultimaActividad && (
              <div>
                <span className="font-medium text-slate-700">Última actividad: </span>
                {ultimaActividad}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

