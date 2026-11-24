'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, House, Plus, ReceiptText, X } from 'lucide-react'

const pasos = [
  { titulo: 'Inicio', icono: House, texto: 'Consulta cuántos encargos esperan respuesta, están por pagar, siguen en curso o ya finalizaron.' },
  { titulo: 'Nuevo encargo', icono: Plus, texto: 'Registra la causa, elige los receptores y revisa los datos de la boleta. Puedes guardar un borrador y retomarlo después.' },
  { titulo: 'Mis causas y Receptores', icono: BriefcaseBusiness, texto: 'Revisa el estado de cada causa o busca receptores por nombre, corte y tribunal.' },
  { titulo: 'Estampos, pagos y boletas', icono: ReceiptText, texto: 'Consulta los documentos firmados, los pagos realizados y las boletas emitidas para tus encargos.' },
]

export default function RecorridoPortal() {
  const dialog = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [paso, setPaso] = useState(0)
  const { titulo, icono: Icono, texto } = pasos[paso]
  const ultimo = paso === pasos.length - 1

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [])

  return (
    <dialog ref={dialog} aria-labelledby="recorrido-titulo" onClose={() => router.replace('/abogados', { scroll: false })}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-auto rounded-3xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/55">
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="recorrido-titulo" className="font-bold">Recorrido de la plataforma</h2>
          <button type="button" aria-label="Cerrar recorrido" onClick={() => dialog.current?.close()}
            className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-blue-600"><X className="size-5" aria-hidden="true" /></button>
        </div>
        <div aria-live="polite" className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <Icono className="size-6 text-blue-800" aria-hidden="true" />
          <p className="mt-2 font-bold text-blue-950">{titulo}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{texto}</p>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-600">{paso + 1} de {pasos.length}</span>
          <div className="flex gap-2">
            {paso > 0 && <button type="button" onClick={() => setPaso(paso - 1)} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Atrás</button>}
            <button type="button" onClick={() => ultimo ? dialog.current?.close() : setPaso(paso + 1)} className="rounded-xl bg-blue-700 px-3.5 py-2 text-sm font-bold text-white hover:bg-blue-800">
              {ultimo ? 'Terminar' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
