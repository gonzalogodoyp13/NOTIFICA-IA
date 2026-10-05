'use client'

import { useEffect, useState } from 'react'
import { Archive, Download, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTimeCL } from '@/lib/utils/dateInput'

type ArchiveFile = { signatureId: string; documentId: string; signedVersionId: string; name: string; rol: string; signedAt: string; checksumSha256: string }
type ArchivePage = { documents: ArchiveFile[]; total: number; page: number; pageSize: number }
export default function SignedArchive() {
  const [q, setQ] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1)
  const [data, setData] = useState<ArchivePage | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    fetch(`/api/signing/archive?${new URLSearchParams({ q: search, page: String(page) })}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || !body.ok) throw new Error()
        setData(body.data)
      }).catch(() => { if (!controller.signal.aborted) setError('No se pudo consultar el archivo. Revisa la conexión y vuelve a intentar.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [search, page, refresh])
  return <section aria-label="Archivo de firmas de la oficina" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="border-b border-slate-200 bg-slate-50 p-5 sm:flex sm:items-start sm:justify-between sm:gap-8">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950"><Archive size={20} /> Archivo de la oficina</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">Todas las firmas FEA validadas, sin límite de antigüedad. Busca por nombre, ROL o identificador y recupera la versión firmada original.</p></div>
      <div className="mt-4 shrink-0 border-l-2 border-blue-700 pl-4 sm:mt-0"><strong className="text-sm text-blue-900">50 días en Windows</strong>
        <p className="mt-1 max-w-64 text-xs leading-relaxed text-slate-600">La carpeta compartida muestra las firmas recientes en todos los equipos autorizados, incluido el firmante. Abre un PDF para descargarlo.</p></div>
    </div>
    <form className="flex flex-wrap gap-2 p-5" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(q.trim()); setRefresh(v => v + 1) }}>
      <label className="min-w-48 flex-1"><span className="sr-only">Buscar firmas por nombre, ROL o identificador</span><Input value={q} maxLength={120} onChange={e => setQ(e.target.value)} placeholder="Nombre del documento, ROL o identificador" /></label>
      <Button type="submit" disabled={loading}><Search size={16} className="mr-2" />Buscar en el archivo</Button>
    </form>
    {error ? <p role="alert" className="px-5 pb-5 text-sm text-red-800">{error}</p> : loading ? <p role="status" className="px-5 pb-5 text-sm text-slate-500">Consultando archivo…</p> : !data?.documents.length ?
      <p className="px-5 pb-7 text-sm text-slate-500">No hay firmas que coincidan con la búsqueda.</p> :
      <ul className="divide-y divide-slate-100">{data.documents.map(file => <li key={file.signatureId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900">{file.name}</p><p className="mt-1 text-xs text-slate-500">ROL {file.rol} · Firmado {formatDateTimeCL(file.signedAt)}</p></div>
        <a className="inline-flex shrink-0 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50"
          href={`/api/signing/archive/${encodeURIComponent(file.signatureId)}?checksum=${file.checksumSha256}`}><Download size={15} />Descargar firmado</a>
      </li>)}</ul>}
    <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-xs text-slate-500">
      <span>{data?.total ?? 0} firmas · Página {page}</span><div className="flex gap-2">
        <Button variant="outline" disabled={loading || page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
        <Button variant="outline" disabled={loading || !data || page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
      </div>
    </footer>
  </section>
}
