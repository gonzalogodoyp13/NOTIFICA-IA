import { FormEvent, useState } from 'react'

import { useCreateNota, useNotas } from '@/lib/hooks/useRolWorkspace'
import { NotaCreateSchema } from '@/lib/validations/rol-workspace'

interface NotaListProps {
  rolId: string
}

export default function NotaList({ rolId }: NotaListProps) {
  const { data, isLoading, isError, error } = useNotas(rolId)
  const createNota = useCreateNota(rolId)

  const [nota, setNota] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validation = NotaCreateSchema.safeParse({ contenido: nota })

    if (!validation.success) {
      setFormError(validation.error.errors[0]?.message ?? 'La nota ingresada no es válida')
      return
    }

    setFormError(null)
    createNota.mutate(validation.data.contenido, {
      onSuccess: () => {
        setNota('')
      },
      onError: mutationError => {
        setFormError(mutationError.message)
      },
    })
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Notas internas</h2>
        {(isLoading || createNota.isPending) && (
          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 animate-ping rounded-full bg-slate-400" />
            Guardando...
          </span>
        )}
      </header>

      {isError && (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Error al obtener las notas: {error?.message ?? 'intenta nuevamente.'}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <label className="block text-sm font-medium text-slate-700" htmlFor="nota-contenido">
          Agregar nota
        </label>
        <textarea
          id="nota-contenido"
          name="nota-contenido"
          className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-800 outline-none ring-blue-200 focus:ring"
          rows={3}
          placeholder="Escribe un comentario o actualización para el equipo..."
          value={nota}
          onChange={event => setNota(event.target.value)}
          disabled={createNota.isPending}
        />
        {formError && <p className="text-sm text-rose-600">{formError}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={createNota.isPending || nota.trim().length === 0}
          >
            {createNota.isPending && <span className="h-2 w-2 animate-ping rounded-full bg-white" />}
            Guardar nota
          </button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, index) => (
            <article
              key={`nota-skeleton-${index}`}
              className="animate-pulse rounded-md border border-slate-100 bg-slate-50 p-4"
            >
              <div className="h-4 w-32 rounded bg-slate-200" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full rounded bg-slate-200" />
                <div className="h-3 w-5/6 rounded bg-slate-200" />
              </div>
            </article>
          ))}

        {!isLoading &&
          !isError &&
          (data ?? []).length === 0 && (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Aún no hay notas registradas para este ROL.
            </p>
          )}

        {!isLoading &&
          !isError &&
          data?.map(notaItem => (
            <article
              key={notaItem.id}
              className="rounded-md border border-slate-100 bg-white p-4 shadow-sm"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>{new Date(notaItem.createdAt).toLocaleString('es-CL')}</span>
                <span>ID usuario: {notaItem.userId}</span>
              </header>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{notaItem.contenido}</p>
            </article>
          ))}
      </div>
    </section>
  )
}
