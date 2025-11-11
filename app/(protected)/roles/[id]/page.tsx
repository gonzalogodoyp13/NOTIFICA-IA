'use client'

import { useState } from 'react'

import RolHeader from './_components/RolHeader'
import RolTabs from './_components/RolTabs'
import DiligenciasTable from './diligencias/DiligenciasTable'
import DocumentoList from './documentos/DocumentoList'
import RolTimeline from './historial/RolTimeline'
import NotaList from './notas/NotaList'
import RolOverview from './resumen/RolOverview'

type RolTabKey = 'resumen' | 'diligencias' | 'documentos' | 'notas' | 'historial'

const TAB_COMPONENTS: Record<RolTabKey, () => JSX.Element> = {
  resumen: RolOverview,
  diligencias: DiligenciasTable,
  documentos: DocumentoList,
  notas: NotaList,
  historial: RolTimeline,
}

interface RolWorkspacePageProps {
  params: { id: string }
}

export default function RolWorkspacePage({ params }: RolWorkspacePageProps) {
  const [activeTab, setActiveTab] = useState<RolTabKey>('resumen')
  const ActiveTabComponent = TAB_COMPONENTS[activeTab]

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <RolHeader />
      <div className="border-b border-slate-200 bg-white shadow-sm">
        <RolTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
      <main className="flex-1 space-y-4 p-6">
        <div className="text-sm text-slate-500">
          Trabajando en el ROL <span className="font-semibold text-slate-700">{params.id}</span>
        </div>
        <ActiveTabComponent />
      </main>
    </div>
  )
}
