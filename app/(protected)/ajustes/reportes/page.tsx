import { getCurrentUserWithOffice } from '@/lib/auth-server'
import ReportesClient from './reportes-client'

export const dynamic = 'force-dynamic'

export default async function ReportesPage() {
  const user = await getCurrentUserWithOffice()
  return <ReportesClient isOfficeAdmin={!!user?.isOfficeAdmin} />
}
