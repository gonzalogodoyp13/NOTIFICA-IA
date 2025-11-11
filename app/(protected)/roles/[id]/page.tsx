'use client'

import RolQueryProvider from './_components/RolQueryProvider'
import RolWorkspaceClient from './_components/RolWorkspaceClient'

interface RolWorkspacePageProps {
  params: { id: string }
}

export default function RolWorkspacePage({ params }: RolWorkspacePageProps) {
  return (
    <RolQueryProvider>
      <RolWorkspaceClient rolId={params.id} />
    </RolQueryProvider>
  )
}
