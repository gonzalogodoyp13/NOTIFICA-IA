import { useTimeline } from '@/lib/hooks/useRolWorkspace'

interface RolTimelineProps {
  rolId: string
}

export default function RolTimeline({ rolId }: RolTimelineProps) {
  const { data, isLoading, isError, error } = useTimeline(rolId)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Historial de actividades</h2>
        {isLoading && (
          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 animate-ping rounded-full bg-slate-400" />
            Cargando...
          </span>
        )}
      </header>

      {isError && (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Error al obtener el historial: {error?.message ?? 'intenta nuevamente.'}
        </p>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Aún no hay eventos registrados para este ROL.
        </p>
      )}

      <ol className="mt-6 space-y-4">
        {isLoading &&
          Array.from({ length: 4 }).map((_, index) => (
            <li key={`timeline-skeleton-${index}`} className="flex gap-4">
              <div className="mt-1 h-3 w-3 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
              </div>
            </li>
          ))}

        {!isLoading &&
          !isError &&
          data?.map(entry => (
            <li key={entry.id} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <div className="mt-1 h-3 w-3 rounded-full bg-slate-400" />
                <div className="ml-[5px] h-full w-px bg-slate-200" />
              </div>
              <div className="flex-1 rounded-md border border-slate-100 bg-white p-4 shadow-sm">
                <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{new Date(entry.createdAt).toLocaleString('es-CL')}</span>
                  <span>{entry.userEmail}</span>
                </header>
                <p className="mt-2 text-sm text-slate-700">{entry.accion}</p>
              </div>
            </li>
          ))}
      </ol>
    </section>
  )
}
