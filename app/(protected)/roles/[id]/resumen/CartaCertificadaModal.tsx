'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Loader2, Mail, X } from 'lucide-react'
import { ModalPortal } from '@/components/ui/modal-portal'
import type { RolWorkspaceData } from '@/lib/hooks/useRolWorkspace'
import { CARTA_FORMATOS, CartaCertificadaSchema, type CartaFormato } from '@/lib/validations/carta-certificada'
import { dmyDateToIso, formatDmyDateInput, isoDateToDmy, localDateToDmy } from '@/lib/utils/dateInput'

const fieldClass = 'mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

export default function CartaCertificadaModal({ rolId, rolData, onClose }: { rolId: string; rolData: RolWorkspaceData; onClose: () => void }) {
  const queryClient = useQueryClient()
  const ejecutados = rolData.demanda?.ejecutados ?? []
  const [ejecutadoId, setEjecutadoId] = useState('')
  const [direccionEjecutadoId, setDireccionEjecutadoId] = useState('')
  const [fechaText, setFechaText] = useState('')
  const [formato, setFormato] = useState<CartaFormato>('art44')
  const [detalle, setDetalle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [documentUrl, setDocumentUrl] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const calendarRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const busyRef = useRef(false)
  busyRef.current = busy
  const fecha = dmyDateToIso(fechaText) ?? ''
  const detailLabel = formato === 'vehiculo' ? 'Placa patente' : formato === 'propiedad' ? 'Registro C.B.R.' : formato === 'otro' ? 'Motivo carta:' : null
  const address = ejecutados.find(item => item.id === direccionEjecutadoId)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    formRef.current?.querySelector<HTMLElement>('select')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current()
      if (event.key !== 'Tab') return
      const elements = Array.from(formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled):not([tabindex="-1"]), textarea:not(:disabled), a[href]') ?? [])
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [])

  const openCalendar = () => {
    try { calendarRef.current?.showPicker() } catch { calendarRef.current?.click() }
  }

  const generate = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const parsed = CartaCertificadaSchema.safeParse({ ejecutadoId, direccionEjecutadoId, fecha, formato, detalle })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Revise los datos.'); return }
    const preview = window.open('', '_blank')
    if (preview) preview.opener = null
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/roles/${rolId}/carta-certificada`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) })
      const payload = await response.json()
      if (!response.ok || !payload?.ok || !payload.data?.id) throw new Error(typeof payload?.error === 'string' ? payload.error : payload?.error?.message ?? 'No fue posible generar la carta.')
      void queryClient.invalidateQueries({ queryKey: ['rol', rolId] })
      const url = `/api/documentos/${payload.data.id}/download?mode=inline`
      if (preview && !preview.closed) { preview.location.href = url; onClose() }
      else setDocumentUrl(url)
    } catch (err) {
      preview?.close()
      setError(err instanceof Error ? err.message : 'No fue posible generar la carta.')
    } finally { setBusy(false) }
  }

  return <ModalPortal ariaLabelledby="carta-title">
    <div className="flex h-full items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <form ref={formRef} onSubmit={generate} className="max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3"><Mail className="h-6 w-6 text-blue-700" /><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Carta certificada · {rolData.rol.numero}</p><h2 id="carta-title" className="mt-1 text-xl font-semibold text-slate-950">Datos Carta Certificada</h2></div></div>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <fieldset disabled={busy || !!documentUrl} className="space-y-5 p-6">
          <div><label htmlFor="carta-demandado" className="text-sm font-semibold text-slate-700">SEÑOR(a):</label>
            <select id="carta-demandado" required value={ejecutadoId} onChange={e => setEjecutadoId(e.target.value)} className={fieldClass} autoFocus>
              <option value="">Seleccione demandado</option>{ejecutados.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
          </div>
          <div><label htmlFor="carta-direccion" className="text-sm font-semibold text-slate-700">Dirección demandado:</label>
            <select id="carta-direccion" required value={direccionEjecutadoId} onChange={e => setDireccionEjecutadoId(e.target.value)} className={fieldClass}>
              <option value="">Seleccione dirección</option>{ejecutados.filter(item => item.direccion?.trim()).map(item => <option key={item.id} value={item.id}>{[item.direccion, item.comuna?.nombre].filter(Boolean).join(', ')} — {item.nombre}</option>)}
            </select>
            {address && <p className="mt-2 text-xs text-slate-500">Comuna: {address.comuna?.nombre || 'Sin comuna registrada'}</p>}
          </div>
          <div><label htmlFor="carta-fecha" className="text-sm font-semibold text-slate-700">Fecha:</label>
            <div className="mt-2 flex gap-2"><button type="button" onClick={() => setFechaText(localDateToDmy())} className="rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800">Hoy</button>
              <div className="relative flex flex-1"><input id="carta-fecha" required inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={fechaText} onClick={openCalendar} onChange={e => setFechaText(formatDmyDateInput(e.target.value))} className="min-w-0 flex-1 rounded-l-xl border border-slate-300 px-3 py-2.5 text-sm" />
                <button type="button" onClick={openCalendar} aria-label="Abrir calendario" className="rounded-r-xl border border-l-0 border-slate-300 px-3 text-slate-600"><CalendarDays className="h-5 w-5" /></button>
                <input ref={calendarRef} type="date" tabIndex={-1} aria-hidden="true" value={fecha} onChange={e => setFechaText(isoDateToDmy(e.target.value))} className="pointer-events-none absolute left-0 top-full h-px w-full opacity-0" />
              </div>
            </div>
          </div>
          <fieldset><legend className="mb-3 text-sm font-semibold text-slate-700">Formato de carta</legend><div className="grid gap-2 sm:grid-cols-2">{Object.entries(CARTA_FORMATOS).map(([value, label]) => <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm ${formato === value ? 'border-blue-300 bg-blue-50 text-blue-950' : 'border-slate-200 text-slate-700'}`}><input type="radio" name="carta-formato" value={value} checked={formato === value} onChange={() => { setFormato(value as CartaFormato); setDetalle(''); setError(null) }} className="accent-blue-700" />{label}</label>)}</div></fieldset>
          {detailLabel && <div><label htmlFor="carta-detalle" className="text-sm font-semibold text-slate-700">{detailLabel}</label>{formato === 'otro' ? <textarea id="carta-detalle" required rows={4} maxLength={3000} value={detalle} onChange={e => setDetalle(e.target.value)} className={fieldClass} /> : <input id="carta-detalle" required maxLength={formato === 'vehiculo' ? 20 : 3000} value={detalle} onChange={e => setDetalle(e.target.value)} className={fieldClass} />}</div>}
        </fieldset>
        <footer className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {documentUrl && <p role="status" className="mb-4 text-sm text-green-800">Carta guardada. <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">Abrir PDF</a></p>}
          <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">{documentUrl ? 'Cerrar' : 'Cancelar'}</button><button type="submit" disabled={busy || !!documentUrl || !ejecutados.length} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{busy ? 'Generando…' : 'Generar carta'}</button></div>
        </footer>
      </form>
    </div>
  </ModalPortal>
}
