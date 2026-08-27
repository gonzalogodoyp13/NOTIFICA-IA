import DashboardCockpit from './DashboardCockpit'
import { getCurrentUserWithOffice } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getCurrentUserWithOffice()
  return <DashboardCockpit isOfficeAdmin={!!user?.isOfficeAdmin} />
}
