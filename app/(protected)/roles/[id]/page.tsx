import RolWorkspaceClient from './_components/RolWorkspaceClient'

interface RolWorkspacePageProps {
  params: { id: string }
}

export default function RolWorkspacePage({ params }: RolWorkspacePageProps) {
  return <RolWorkspaceClient rolId={params.id} />
}
