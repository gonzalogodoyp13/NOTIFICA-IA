'use client'

import { useEffect, useMemo, useState } from 'react'

import { useEstampos } from '@/lib/hooks/useAjustes'
import { useGenerateEstampo } from '@/lib/hooks/useRolWorkspace'
import { EstampoGenerateSchema } from '@/lib/validations/rol-workspace'

interface EstampoModalProps {
  rolId: string
  diligenciaId: string
  onClose: () => void
  onGenerated?: () => void
}

interface EstampoCatalogItem {
  id: string
  nombre: string
  tipo?: string | null
  contenido?: string | null
}

export default function EstampoModal({
  rolId,
  diligenciaId,
  onClose,
  onGenerated,
}: EstampoModalProps) {
  const { data: estampos = [], isLoading, error } = useEstampos()
  const [selectedId, setSelectedId] = useState('')
  const [texto, setTexto] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const generateEstampo = useGenerateEstampo(rolId, diligenciaId)

  const selectedEstampo = useMemo<EstampoCatalogItem | undefined>(
    () => estampos.find(item => String(item.id) === selectedId),
    [estampos, selectedId]
  )

  useEffect(() => {
    if (selectedEstampo?.contenido) {
      setTexto(selectedEstampo.contenido)
    } else {
      setTexto('')
    }
  }, [selectedEstampo])

  useEffect(() => {
    if (generateEstampo.isSuccess) {
      setSuccessMsg('Estampo generado correctamente.')
      onGenerated?.()
      const timeout = setTimeout(() => {
        onClose()
      }, 1500)
      return () => clearTimeout(timeout)
    }
    return undefined
  }, [generateEstampo.isSuccess, onClose, onGenerated])

  const handleSubmit = () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!selectedId) {
      setErrorMsg('Selecciona un estampo para continuar.')
      return
    }

    const validation = EstampoGenerateSchema.safeParse({
      estampoId: selectedId,
      variables: {
        contenido: texto,
      },
    })

    if (!validation.success) {
      setErrorMsg(validation.error.issues[0]?.message ?? 'Datos inválidos.')
      return
    }

    generateEstampo.mutate(validation.data, {
      onError: mutationError => {
        setErrorMsg(mutationError.message || 'No se pudo generar el estampo.')
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Generar Estampo</h2>
          <button
            type="button"
            className="text-sm text-slate-500 transition hover:text-slate-700"
            onClick={onClose}
          >
            Cerrar
          </button>
        </header>

        <div className="mt-4 space-y-4 text-sm">
          <div>
            <label className="block font-medium text-slate-700" htmlFor="estampo-select">
              Estampo disponible
            </label>
            {isLoading ? (
              <p className="mt-2 text-xs text-slate-400">Cargando estampos…</p>
            ) : (
              <select
                id="estampo-select"
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={selectedId}
                onChange={event => setSelectedId(event.target.value)}
              >
                <option value="">Seleccione un estampo…</option>
                {estampos.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                    {item.tipo ? ` (${item.tipo})` : ''}
                  </option>
                ))}
              </select>
            )}
            {error && (
              <p className="mt-1 text-xs text-rose-600">
                No se pudieron cargar los estampos del catálogo. Usa un estampo predefinido.
              </p>
            )}
          </div>

          <div>
            <label className="block font-medium text-slate-700" htmlFor="estampo-texto">
              Contenido del estampo
            </label>
            <textarea
              id="estampo-texto"
              className="mt-1 h-32 w-full rounded border border-slate-300 p-2 font-mono text-xs"
              placeholder="Contenido del estampo…"
              value={texto}
              onChange={event => setTexto(event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Puedes modificar el contenido antes de generar el PDF.
            </p>
          </div>
        </div>

        {errorMsg && <p className="mt-3 text-sm text-rose-600">{errorMsg}</p>}
        {successMsg && <p className="mt-3 text-sm text-emerald-600">{successMsg}</p>}

        <footer className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
            onClick={onClose}
            disabled={generateEstampo.isPending}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
            onClick={handleSubmit}
            disabled={generateEstampo.isPending || !selectedId}
          >
            {generateEstampo.isPending ? 'Generando…' : 'Generar Estampo'}
          </button>
        </footer>
      </div>
    </div>
  )
}
