'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'

import { ModalPortal } from '@/components/ui/modal-portal'
import { useChangeRolStatus } from '@/lib/hooks/useRolWorkspace'

interface RolStatusActionsProps {
  rolId: string
  rolNumero: string
  current: string
}

const TRANSITIONS: Record<string, string[]> = {
  pendiente: ['en_proceso', 'archivado'],
  en_proceso: ['terminado', 'archivado'],
  terminado: ['archivado'],
  archivado: [],
}

const LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  terminado: 'Terminado',
  archivado: 'Archivado',
}

function transitionCopy(next: string) {
  if (next === 'terminado') {
    return {
      title: 'Marcar ROL como terminado',
      description: 'Todas las diligencias deben estar completadas. Después del cambio, el flujo quedará disponible solo para consulta y descarga.',
      confirm: 'Marcar como terminado',
    }
  }
  if (next === 'archivado') {
    return {
      title: 'Archivar ROL',
      description: 'El ROL quedará en modo de solo lectura y no podrá reactivarse. Podrás seguir consultando su historial y documentos.',
      confirm: 'Archivar ROL',
    }
  }
  return {
    title: 'Iniciar trabajo del ROL',
    description: 'El estado cambiará a En proceso. Las diligencias continuarán disponibles para trabajar normalmente.',
    confirm: 'Cambiar a En proceso',
  }
}

export default function RolStatusActions({ rolId, rolNumero, current }: RolStatusActionsProps) {
  const { mutate, isPending, reset } = useChangeRolStatus(rolId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [targetStatus, setTargetStatus] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const options = useMemo(() => TRANSITIONS[current || 'pendiente'] ?? [], [current])
  const copy = targetStatus ? transitionCopy(targetStatus) : null

  useEffect(() => {
    if (!isPending && !errorMsg && successMsg) {
      const timeout = setTimeout(() => setSuccessMsg(null), 3000)
      return () => clearTimeout(timeout)
    }
    return undefined
  }, [isPending, errorMsg, successMsg])

  const chooseStatus = (status: string) => {
    reset()
    setErrorMsg(null)
    setMenuOpen(false)
    setTargetStatus(status)
  }

  const closeConfirmation = () => {
    if (isPending) return
    reset()
    setErrorMsg(null)
    setTargetStatus(null)
  }

  const confirmChange = () => {
    if (!targetStatus || isPending) return
    setErrorMsg(null)
    setSuccessMsg(null)
    mutate(targetStatus, {
      onSuccess: () => {
        setSuccessMsg(`Estado actualizado a ${LABELS[targetStatus] ?? targetStatus}.`)
        setTargetStatus(null)
      },
      onError: error => setErrorMsg(error.message || 'No se pudo actualizar el estado.'),
    })
  }

  if (options.length === 0) return null

  return (
    <div className="relative flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(open => !open)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      >
        Cambiar estado
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {menuOpen && (
        <div role="menu" className="absolute right-0 top-11 z-30 min-w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {options.map(option => (
            <button
              key={option}
              role="menuitem"
              type="button"
              onClick={() => chooseStatus(option)}
              className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {LABELS[option] ?? option}
            </button>
          ))}
        </div>
      )}

      {successMsg && <p role="status" className="text-xs text-emerald-600">{successMsg}</p>}

      {targetStatus && copy && (
        <ModalPortal>
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" aria-labelledby="status-dialog-title" className="w-full max-w-md rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="status-dialog-title" className="text-lg font-semibold text-slate-950">{copy.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{copy.description}</p>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
                <div><dt className="text-xs text-slate-500">ROL</dt><dd className="mt-1 font-semibold text-slate-800">{rolNumero}</dd></div>
                <div><dt className="text-xs text-slate-500">Transición</dt><dd className="mt-1 font-semibold text-slate-800">{LABELS[current]} → {LABELS[targetStatus]}</dd></div>
              </dl>

              {errorMsg && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMsg}</p>}

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button type="button" onClick={closeConfirmation} disabled={isPending} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                <button type="button" onClick={confirmChange} disabled={isPending} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
                  {isPending ? 'Actualizando estado…' : copy.confirm}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
