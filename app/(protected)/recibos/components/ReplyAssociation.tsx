'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Option = { id: string; subject: string; recipientName: string; recipientEmails: string[]; sentAt: string | null }

export default function ReplyAssociation({ replyId, onAssociated }: { replyId: string; onAssociated: () => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Option[]>([])
  const [selected, setSelected] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function search() {
    setBusy(true); setError(''); setSelected(''); setConfirmed(false)
    try {
      const response = await fetch(`/api/recibos/send/replies/${replyId}/association?q=${encodeURIComponent(q)}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error?.message || 'No se pudieron cargar los envíos.')
      setItems(payload.data.items)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Error al buscar.') }
    finally { setBusy(false) }
  }
  async function associate() {
    if (!selected || !confirmed || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/recibos/send/replies/${replyId}/association`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId: selected, confirmed }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error?.message || 'No se pudo asociar la respuesta.')
      setOpen(false); onAssociated()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Error al asociar.') }
    finally { setBusy(false) }
  }
  if (!open) return <Button variant="outline" onClick={() => { setOpen(true); void search() }}>Asociar a un envío</Button>
  return <div className="mt-3 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
    <label className="block text-sm">Buscar por destinatario o asunto<input className="mt-1 w-full rounded border border-slate-300 p-2" value={q} onChange={event => setQ(event.target.value)} disabled={busy} /></label>
    <Button variant="outline" onClick={search} disabled={busy}>Buscar envíos</Button>
    <p className="text-xs">Se muestran hasta 50 envíos. Refina la búsqueda si falta el esperado.</p>
    <label className="block text-sm">Envío de destino<select className="mt-1 w-full rounded border border-slate-300 p-2" value={selected} onChange={event => { setSelected(event.target.value); setConfirmed(false) }} disabled={busy}>
      <option value="">Seleccionar envío</option>
      {items.map(item => <option key={item.id} value={item.id}>{item.recipientName} · {item.recipientEmails.join(', ')} · {item.subject} · {item.sentAt ? new Date(item.sentAt).toLocaleString('es-CL') : ''}</option>)}
    </select></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!selected || busy} />Confirmo que esta respuesta corresponde al envío seleccionado.</label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex gap-2"><Button onClick={associate} disabled={!selected || !confirmed || busy}>{busy ? 'Procesando...' : 'Confirmar asociación'}</Button><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button></div>
  </div>
}
