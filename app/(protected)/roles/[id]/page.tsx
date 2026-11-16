import RolWorkspaceClient from './_components/RolWorkspaceClient'

interface RolWorkspacePageProps {
  params: Promise<{ id: string }>
}

export default async function RolWorkspacePage(props: RolWorkspacePageProps) {
  const params = await props.params;
  return <RolWorkspaceClient rolId={params.id} />
}
