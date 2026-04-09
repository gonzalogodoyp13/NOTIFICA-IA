import { BriefcaseBusiness, Landmark, Scale } from 'lucide-react'
import { type RolHeaderData } from '@/lib/hooks/useRolWorkspace'

import RolStatusActions from './RolStatusActions'
import RolStatusBadge from './RolStatusBadge'

interface RolHeaderProps {
  data?: RolHeaderData
  isLoading: boolean
}

export default function RolHeader({ data, isLoading }: RolHeaderProps) {
  if (isLoading) {
    return (
      <header className="border-b border-slate-200/80 bg-white/82 px-6 py-6 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 text-sm text-slate-500">
          <div className="h-10 w-10 animate-pulse rounded-2xl bg-slate-200" />
          <div className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
            <div className="h-4 w-52 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      </header>
    )
  }

  const estado = data?.rol?.estado ?? 'pendiente'
  const rolId = data?.rol?.id

  return (
    <header className="border-b border-slate-200/80 bg-white/82 px-6 py-6 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-slate-900 text-white shadow-[0_18px_36px_-24px_rgba(15,23,42,0.8)]">
            <Landmark className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Expediente judicial
            </div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {data?.rol?.numero || 'ROL sin numero'}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                <Scale className="h-4 w-4 text-blue-700" />
                {data?.tribunal?.nombre || 'Tribunal no asignado'}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-sm">
                <BriefcaseBusiness className="h-4 w-4 text-slate-500" />
                Workspace operativo del caso
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-w-[230px] flex-col items-start gap-3 sm:items-end">
          <RolStatusBadge estado={estado} />
          {rolId && <RolStatusActions rolId={rolId} current={estado} />}
        </div>
      </div>
    </header>
  )
}
