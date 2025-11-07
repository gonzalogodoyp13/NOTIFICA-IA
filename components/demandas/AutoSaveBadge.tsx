// AutoSaveBadge component
// Shows autosave status (✅ Saved hh:mm or 🕑 Saving...)
'use client'

interface AutoSaveBadgeProps {
  isSaving: boolean
  lastSaved?: Date | null
}

export default function AutoSaveBadge({ isSaving, lastSaved }: AutoSaveBadgeProps) {
  const formatTime = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }

  if (isSaving) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium border border-blue-200">
        <span>🕑</span>
        <span>Guardando...</span>
      </div>
    )
  }

  if (lastSaved) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-md text-xs font-medium border border-green-200">
        <span>✅</span>
        <span>Guardado {formatTime(lastSaved)}</span>
      </div>
    )
  }

  return null
}


