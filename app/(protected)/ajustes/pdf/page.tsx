import { redirect } from 'next/navigation'

import { getCachedAuthenticatedUser } from '@/lib/auth-server'
import PdfSettingsClient from './PdfSettingsClient'

export const dynamic = 'force-dynamic'

export default async function PdfSettingsPage() {
  const user = await getCachedAuthenticatedUser()
  if (!user.isOfficeAdmin) redirect('/ajustes')
  return <PdfSettingsClient />
}
