'use client'

import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { ModalPortal } from '@/components/ui/modal-portal'

type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({ open, title, description, confirmLabel, busy = false, destructive = false, onConfirm, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
      openerRef.current?.focus()
    }
  }, [busy, onClose, open])

  if (!open) return null
  return <ModalPortal ariaLabelledby="report-confirm-title" ariaDescribedby="report-confirm-description">
    <div className="flex h-full w-full items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div ref={panelRef} className="w-full max-w-lg rounded-[28px] border border-white/80 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><span className={`rounded-2xl p-3 ${destructive ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}><AlertTriangle className="h-5 w-5" /></span><button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar confirmación" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        <h2 id="report-confirm-title" className="mt-5 text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
        <p id="report-confirm-description" className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button ref={cancelRef} variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>{busy ? 'Procesando…' : confirmLabel}</Button></div>
      </div>
    </div>
  </ModalPortal>
}
