import { type RolWorkspaceData } from '@/lib/hooks/useRolWorkspace'

import RolStatusActions from './RolStatusActions'
import RolStatusBadge from './RolStatusBadge'

interface RolHeaderProps {
  data?: RolWorkspaceData
  isLoading: boolean
}

export default function RolHeader({ data, isLoading }: RolHeaderProps) {
  if (isLoading) {
    return (
      <header className="bg-white p-4 text-sm text-slate-400 shadow-sm">
        Cargando ROL…
      </header>
    )
  }

  const estado = data?.rol?.estado ?? 'pendiente'
  const rolId = data?.rol?.id

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">
          {data?.rol?.numero || 'ROL sin número'}
        </h1>
        <p className="text-sm text-slate-500">
          {data?.tribunal?.nombre || 'Tribunal no asignado'}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <RolStatusBadge estado={estado} />
        {rolId && <RolStatusActions rolId={rolId} current={estado} />}
      </div>
    </header>
  )
}

