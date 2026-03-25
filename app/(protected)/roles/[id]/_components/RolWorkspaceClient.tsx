'use client'

import { useMemo, useState } from 'react'

import RolHeader from './RolHeader'
import RolTabs from './RolTabs'
import { useRolData } from '@/lib/hooks/useRolWorkspace'

type RolTabKey = 'resumen' | 'diligencias' | 'documentos' | 'notas' | 'historial'

interface RolWorkspaceClientProps {
  rolId: string
}

export default function RolWorkspaceClient({ rolId }: RolWorkspaceClientProps) {
  const [activeTab, setActiveTab] = useState<RolTabKey>('resumen')
  const { data: rolData, isLoading, isError, error } = useRolData(rolId)

  const ActiveTabComponent = useMemo(() => {
    switch (activeTab) {
      case 'resumen':
        return require('../resumen/RolOverview').default
      case 'diligencias':
        return require('../diligencias/DiligenciasTable').default
      case 'documentos':
        return require('../documentos/DocumentoList').default
      case 'notas':
        return require('../notas/NotaList').default
      case 'historial':
        return require('../historial/RolTimeline').default
      default:
        return null
    }
  }, [activeTab])

  return (
    <div className="min-h-screen bg-transparent">
      <RolHeader data={rolData} isLoading={isLoading} />
      <div className="mx-auto max-w-7xl">
        <RolTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
      <main className="page-frame pb-10">
        <div className="app-section px-6 py-6">
          <div className="mb-5 text-sm text-slate-500">
            Trabajando en el ROL{' '}
            <span className="font-semibold text-slate-700">
              {rolData?.rol?.numero ?? rolId}
            </span>
          </div>
          {isError && (
            <div className="mb-5 rounded-[24px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              Error al cargar datos del ROL: {error?.message ?? 'intenta nuevamente mas tarde.'}
            </div>
          )}
          {ActiveTabComponent && (
            <ActiveTabComponent
              rolId={rolId}
              rolData={rolData}
              isRolLoading={isLoading}
              isRolError={isError}
            />
          )}
        </div>
      </main>
    </div>
  )
}
