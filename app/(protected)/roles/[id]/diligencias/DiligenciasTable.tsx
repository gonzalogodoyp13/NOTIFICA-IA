import { useMemo } from 'react'

import { useDiligencias, type DiligenciaItem } from '@/lib/hooks/useRolWorkspace'

interface DiligenciasTableProps {
  rolId: string
}

const estadoClases: Record<DiligenciaItem['estado'], string> = {
  pendiente: 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800',
  completada: 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800',
  fallida: 'rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800',
}

export default function DiligenciasTable({ rolId }: DiligenciasTableProps) {
  const { data, isLoading, isError, error } = useDiligencias(rolId)

  const sorted = useMemo(
    () =>
      (data ?? []).slice().sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }),
    [data]
  )

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Diligencias</h2>
        {isLoading && (
          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 animate-ping rounded-full bg-slate-400" />
            Cargando...
          </span>
        )}
      </header>

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
              sorted.map(diligencia => (
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
                      <button
                        type="button"
                        className="cursor-not-allowed rounded border border-slate-200 px-3 py-1 text-slate-400"
                        disabled
                        title="Disponible en la siguiente fase"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="cursor-not-allowed rounded border border-slate-200 px-3 py-1 text-slate-400"
                        disabled
                        title="Disponible en la siguiente fase"
                      >
                        Generar Boleta
                      </button>
                      <button
                        type="button"
                        className="cursor-not-allowed rounded border border-slate-200 px-3 py-1 text-slate-400"
                        disabled
                        title="Disponible en la siguiente fase"
                      >
                        Generar Estampo
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

