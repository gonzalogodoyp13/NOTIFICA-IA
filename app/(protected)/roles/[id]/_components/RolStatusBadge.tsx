'use client'

interface RolStatusBadgeProps {
  estado?: string
}

const COLOR_MAP: Record<string, string> = {
  pendiente: 'border-amber-200 bg-amber-50 text-amber-800',
  en_proceso: 'border-blue-200 bg-blue-50 text-blue-800',
  terminado: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  archivado: 'border-slate-200 bg-slate-100 text-slate-700',
}

export default function RolStatusBadge({ estado }: RolStatusBadgeProps) {
  const normalized = estado ?? 'pendiente'
  const color = COLOR_MAP[normalized] ?? COLOR_MAP.pendiente

  return (
    <span className={`status-pill border ${color}`}>
      {(estado ?? 'pendiente').replace('_', ' ')}
    </span>
  )
}
