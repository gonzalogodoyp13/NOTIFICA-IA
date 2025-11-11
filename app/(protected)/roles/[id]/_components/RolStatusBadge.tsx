'use client'

interface RolStatusBadgeProps {
  estado?: string
}

const COLOR_MAP: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  en_proceso: 'bg-blue-100 text-blue-800',
  terminado: 'bg-green-100 text-green-800',
  archivado: 'bg-gray-200 text-gray-700',
}

export default function RolStatusBadge({ estado }: RolStatusBadgeProps) {
  const normalized = estado ?? 'pendiente'
  const color = COLOR_MAP[normalized] ?? COLOR_MAP.pendiente

  return (
    <span className={`rounded px-2 py-1 text-xs font-medium capitalize ${color}`}>
      {(estado ?? 'pendiente').replace('_', ' ')}
    </span>
  )
}

