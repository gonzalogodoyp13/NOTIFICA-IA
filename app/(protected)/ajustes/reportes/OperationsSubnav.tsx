'use client'

import { CalendarClock, LayoutDashboard, ListTodo, Settings2, UsersRound } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { KeyboardEvent } from 'react'

export type OperationsView = 'control' | 'jobs' | 'recipients' | 'schedules' | 'custom'

const items: Array<{ value: OperationsView; label: string; copy: string; icon: typeof LayoutDashboard }> = [
  { value: 'control', label: 'Control', copy: 'Operaciones e inventario', icon: LayoutDashboard },
  { value: 'jobs', label: 'Trabajos', copy: 'Cola, progreso y reintentos', icon: ListTodo },
  { value: 'recipients', label: 'Destinatarios', copy: 'Elegibilidad por reporte', icon: UsersRound },
  { value: 'schedules', label: 'Programación', copy: 'Frecuencia y salud', icon: CalendarClock },
  { value: 'custom', label: 'Personalizados', copy: 'Definiciones seguras', icon: Settings2 },
]

export default function OperationsSubnav({ active }: { active: OperationsView }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hrefFor = (view: OperationsView) => {
    const next = new URLSearchParams(searchParams.toString())
    next.set('section', 'operations')
    next.set('view', view)
    if (view !== 'control') next.delete('reportId')
    return `${pathname}?${next.toString()}`
  }
  const handleKey = (event: KeyboardEvent<HTMLElement>) => {
    const index = items.findIndex(item => item.value === active)
    const key = event.key
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(key)) return
    event.preventDefault()
    const next = key === 'Home' ? 0 : key === 'End' ? items.length - 1 : key === 'ArrowRight' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
    window.location.assign(hrefFor(items[next].value))
  }
  return <nav aria-label="Vistas de Resumen y operaciones" className="mb-6 overflow-x-auto rounded-[26px] border border-slate-200 bg-white p-2 shadow-sm">
    <div role="tablist" className="grid min-w-[820px] grid-cols-5 gap-1.5">
      {items.map(item => { const selected = item.value === active; const Icon = item.icon; return <a key={item.value} href={hrefFor(item.value)} id={`operations-view-${item.value}`} role="tab" aria-selected={selected} aria-controls={`operations-panel-${item.value}`} tabIndex={selected ? 0 : -1} onKeyDown={handleKey} className={`group rounded-2xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${selected ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
        <span className="flex items-center gap-2 text-sm font-semibold"><Icon className={`h-4 w-4 ${selected ? 'text-cyan-300' : 'text-blue-700'}`} />{item.label}</span>
        <span className={`mt-1 block text-[11px] leading-4 ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{item.copy}</span>
      </a> })}
    </div>
  </nav>
}
