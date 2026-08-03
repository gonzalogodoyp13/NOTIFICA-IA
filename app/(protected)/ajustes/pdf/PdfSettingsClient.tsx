'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, FileImage, Loader2, Save, ShieldCheck, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { FormEvent, useEffect, useState } from 'react'

import { useOfficeCacheContext } from '@/lib/cache/officeCacheContext'

type Settings = {
  config: { receptorNombre: string | null; receptorDireccionLinea: string | null; receptorTelefono: string | null }
  assets: Record<'firma' | 'sello' | 'reciboStamp', { configured: boolean; previewUrl: string }>
  cacheRevision: number
}

const assetLabels = { firma: 'Firma', sello: 'Sello', reciboStamp: 'Timbre de recibo' } as const

async function readSettings(): Promise<Settings> {
  const response = await fetch('/api/ajustes/pdf', { cache: 'no-store' })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'No se pudo cargar la configuracion PDF')
  return body.data
}

export default function PdfSettingsClient() {
  const queryClient = useQueryClient()
  const { officeId, cacheRevision, advanceCacheRevision } = useOfficeCacheContext()
  const query = useQuery({ queryKey: ['pdf-settings', officeId, cacheRevision], queryFn: readSettings, staleTime: 5 * 60 * 1000 })
  const [fields, setFields] = useState({ receptorNombre: '', receptorDireccionLinea: '', receptorTelefono: '' })
  const [files, setFiles] = useState<Partial<Record<keyof typeof assetLabels, File>>>({})
  const [remove, setRemove] = useState<Partial<Record<keyof typeof assetLabels, boolean>>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!query.data) return
    setFields({
      receptorNombre: query.data.config.receptorNombre ?? '',
      receptorDireccionLinea: query.data.config.receptorDireccionLinea ?? '',
      receptorTelefono: query.data.config.receptorTelefono ?? '',
    })
  }, [query.data])
  useEffect(() => {
    if (!success) return
    const timer = window.setTimeout(() => setSuccess(null), 4000)
    return () => window.clearTimeout(timer)
  }, [success])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    for (const file of Object.values(files)) {
      if (file && (file.type !== 'image/png' || file.size > 5 * 1024 * 1024)) {
        setError('Cada recurso debe ser un PNG de hasta 5 MB.')
        return
      }
    }
    const form = new FormData()
    Object.entries(fields).forEach(([key, value]) => form.set(key, value))
    Object.entries(files).forEach(([key, value]) => value && form.set(key, value))
    Object.entries(remove).forEach(([key, value]) => value && form.set(`remove${key.charAt(0).toUpperCase()}${key.slice(1)}`, 'true'))
    setSaving(true)
    try {
      const response = await fetch('/api/ajustes/pdf', { method: 'PUT', body: form })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'No se pudo guardar')
      const data = body.data as Settings
      advanceCacheRevision(data.cacheRevision)
      queryClient.setQueryData(['pdf-settings', officeId, data.cacheRevision], data)
      queryClient.invalidateQueries({ queryKey: ['receipt-workflow'] })
      setFiles({})
      setRemove({})
      setSuccess('Configuracion PDF actualizada correctamente.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuracion')
    } finally {
      setSaving(false)
    }
  }

  if (query.isLoading) return <div className="page-frame flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-700" /></div>
  if (query.error || !query.data) return <div className="page-frame py-16 text-center text-red-700">{query.error instanceof Error ? query.error.message : 'No se pudo cargar la configuracion.'}</div>

  return (
    <div className="app-shell min-h-screen">
      <main className="page-frame page-stack">
        <section className="page-header">
          <div>
            <div className="page-kicker">Documentos oficiales</div>
            <h1 className="page-title">Configuracion PDF</h1>
            <p className="page-copy">Controla la identidad visual y los datos del receptor usados al generar documentos.</p>
          </div>
          <div className="app-panel-muted flex max-w-sm gap-3 px-4 py-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p className="text-sm leading-6 text-slate-600">Los cambios quedan auditados y se aplican de inmediato a nuevas generaciones.</p></div>
        </section>

        <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
          <section className="app-section p-6 md:p-8">
            <h2 className="text-lg font-semibold text-slate-950">Datos del receptor</h2>
            <div className="mt-6 grid gap-5">
              {([
                ['receptorNombre', 'Nombre del receptor', 160],
                ['receptorDireccionLinea', 'Direccion', 240],
                ['receptorTelefono', 'Telefono', 60],
              ] as const).map(([key, label, maxLength]) => <label key={key} className="grid gap-2 text-sm font-semibold text-slate-700">{label}<input value={fields[key]} maxLength={maxLength} onChange={event => setFields(current => ({ ...current, [key]: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>)}
            </div>
          </section>

          <section className="app-section p-6 md:p-8">
            <h2 className="text-lg font-semibold text-slate-950">Recursos graficos</h2>
            <div className="mt-6 grid gap-4">
              {(Object.keys(assetLabels) as Array<keyof typeof assetLabels>).map(kind => {
                const asset = query.data.assets[kind]
                return <div key={kind} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3"><div><div className="font-semibold text-slate-900">{assetLabels[kind]}</div><div className="mt-1 text-xs text-slate-500">{remove[kind] ? 'Se usara el recurso predeterminado' : files[kind] ? files[kind]!.name : asset.configured ? 'Personalizado' : 'Predeterminado'}</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${asset.configured && !remove[kind] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{asset.configured && !remove[kind] ? 'Configurado' : 'Fallback'}</span></div>
                  <div className="relative mt-4 h-28 overflow-hidden rounded-xl border border-slate-200 bg-white"><Image unoptimized fill sizes="420px" src={`${asset.previewUrl}?revision=${query.data.cacheRevision}`} alt={`Vista previa de ${assetLabels[kind]}`} className="object-contain p-2" /></div>
                  <div className="mt-4 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"><Upload className="h-3.5 w-3.5" />Reemplazar<input type="file" accept="image/png" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) { setFiles(current => ({ ...current, [kind]: file })); setRemove(current => ({ ...current, [kind]: false })) } }} /></label>{asset.configured && <button type="button" onClick={() => { setRemove(current => ({ ...current, [kind]: true })); setFiles(current => ({ ...current, [kind]: undefined })) }} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-red-200 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" />Quitar</button>}</div>
                </div>
              })}
            </div>
          </section>

          <div className="xl:col-span-2 flex flex-wrap items-center justify-between gap-4">
            <Link href="/ajustes" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" />Volver a Ajustes</Link>
            <button disabled={saving} className="inline-flex min-w-44 items-center justify-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-800 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </form>
      </main>
      {error && <div role="alert" className="fixed bottom-6 right-6 z-50 max-w-md rounded-2xl bg-red-700 px-5 py-4 text-sm font-semibold text-white shadow-2xl">{error}</div>}
      {success && <div role="status" className="fixed bottom-6 right-6 z-50 flex max-w-md items-center gap-3 rounded-2xl bg-emerald-700 px-5 py-4 text-sm font-semibold text-white shadow-2xl"><CheckCircle2 className="h-5 w-5" />{success}</div>}
    </div>
  )
}
