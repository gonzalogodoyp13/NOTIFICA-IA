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
    <div className="flex min-h-screen flex-col bg-slate-50">
      <RolHeader data={rolData} isLoading={isLoading} />
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <RolTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
      <main className="flex-1 space-y-4 p-6">
        <div className="text-sm text-slate-500">
          Trabajando en el ROL <span className="font-semibold text-slate-700">
            {rolData?.rol?.numero ?? rolId}
          </span>
        </div>
        {isError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error al cargar datos del ROL: {error?.message ?? 'intenta nuevamente más tarde.'}
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
      </main>
    </div>
  )
}

