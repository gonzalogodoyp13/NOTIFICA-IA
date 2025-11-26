'use client'

import { useState } from 'react'
import { useDocumentos } from '@/lib/hooks/useRolWorkspace'

interface DocumentoListProps {
  rolId: string
}

export default function DocumentoList({ rolId }: DocumentoListProps) {
  const { data, isLoading, isError, error } = useDocumentos(rolId)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const handleDownload = async (docId: string, docNombre: string) => {
    setDownloadingId(docId)
    setDownloadError(null)

    try {
      const response = await fetch(`/api/documentos/${docId}/download`, {
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(
          errorData?.error || `Error ${response.status}: ${response.statusText}`
        )
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${docNombre}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error descargando documento:', error)
      setDownloadError(
        error instanceof Error ? error.message : 'Error al descargar el documento'
      )
      // Limpiar error después de 5 segundos
      setTimeout(() => setDownloadError(null), 5000)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Documentos</h2>
        {isLoading && (
          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 animate-ping rounded-full bg-slate-400" />
            Cargando...
          </span>
        )}
      </header>

      {isError && (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Error al obtener los documentos: {error?.message ?? 'intenta nuevamente.'}
        </p>
      )}

      {downloadError && (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {downloadError}
        </p>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Este ROL todavía no tiene documentos disponibles.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, index) => (
            <li
              key={`doc-skeleton-${index}`}
              className="flex animate-pulse items-center justify-between gap-4 rounded-md border border-slate-100 bg-slate-50 p-4"
            >
              <div className="flex flex-col gap-2">
                <span className="inline-block h-4 w-40 rounded bg-slate-200" />
                <span className="inline-block h-3 w-24 rounded bg-slate-200" />
              </div>
              <span className="inline-block h-8 w-20 rounded bg-slate-200" />
            </li>
          ))}

        {!isLoading &&
          !isError &&
          data?.map(doc => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-4 rounded-md border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div>
                <div className="font-medium text-slate-800">{doc.nombre}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {doc.tipo} · versión {doc.version} ·{' '}
                  {new Date(doc.createdAt).toLocaleString('es-CL')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(doc.id, doc.nombre)}
                disabled={!doc.pdfId || downloadingId === doc.id}
                className={
                  !doc.pdfId || downloadingId === doc.id
                    ? 'cursor-not-allowed rounded border border-slate-200 px-4 py-2 text-xs font-medium text-slate-400'
                    : 'rounded border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors'
                }
                title={
                  !doc.pdfId
                    ? 'Este documento no tiene PDF disponible'
                    : downloadingId === doc.id
                      ? 'Descargando...'
                      : 'Descargar PDF'
                }
              >
                {downloadingId === doc.id ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                    Descargando...
                  </span>
                ) : (
                  'Descargar'
                )}
              </button>
            </li>
          ))}
      </ul>
    </section>
  )
}

