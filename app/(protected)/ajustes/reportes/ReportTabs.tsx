'use client'

import { FileStack, History, LayoutDashboard } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useRef, type KeyboardEvent } from 'react'

import type { ReportSection } from './reportes-types'

const tabs: Array<{ id: ReportSection; label: string; copy: string; icon: typeof LayoutDashboard }> = [
  { id: 'operations', label: 'Resumen y operaciones', copy: 'Generar, descargar y enviar', icon: LayoutDashboard },
  { id: 'versions', label: 'Historial de versiones', copy: 'Archivos inmutables y checksums', icon: FileStack },
  { id: 'deliveries', label: 'Historial de entregas', copy: 'Intentos, destinatarios y trazabilidad', icon: History },
]

export default function ReportTabs({ active }: { active: ReportSection }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const refs = useRef<Array<HTMLAnchorElement | null>>([])
  const hrefFor = (section: ReportSection) => {
    const next = new URLSearchParams(searchParams.toString())
    next.set('section', section)
    return `${pathname}?${next.toString()}`
  }
  const handleKeys = (event: KeyboardEvent<HTMLElement>) => {
    const index = tabs.findIndex(tab => tab.id === active)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    window.location.assign(hrefFor(tabs[next].id))
  }
  return <div role="tablist" aria-label="Secciones de Reportes" className="grid gap-2 rounded-[28px] border border-slate-200/80 bg-slate-950 p-2 shadow-xl shadow-slate-950/10 lg:grid-cols-3">
    {tabs.map((tab, index) => {
      const Icon = tab.icon
      const selected = tab.id === active
      return <a key={tab.id} ref={element => { refs.current[index] = element }} href={hrefFor(tab.id)} id={`reports-tab-${tab.id}`} role="tab" aria-selected={selected} aria-controls={`reports-panel-${tab.id}`} tabIndex={selected ? 0 : -1} onKeyDown={handleKeys} className={`group flex min-h-20 items-center gap-3 rounded-[22px] px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${selected ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
        <span className={`rounded-2xl p-2.5 ${selected ? 'bg-blue-50 text-blue-700' : 'bg-white/10 text-slate-300'}`}><Icon className="h-5 w-5" /></span>
        <span><span className="block text-sm font-semibold">{tab.label}</span><span className={`mt-1 block text-xs ${selected ? 'text-slate-500' : 'text-slate-400'}`}>{tab.copy}</span></span>
      </a>
    })}
  </div>
}
