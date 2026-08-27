import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import ReportesClient from './reportes-client'

export const dynamic = 'force-dynamic'

export default async function ReportesPage() {
  const user = await getCurrentUserWithOffice()
  if (!user?.isOfficeAdmin) redirect('/dashboard?notice=reportes-restringidos')
  return <ReportesClient />
}
