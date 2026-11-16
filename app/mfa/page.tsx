import { redirect } from 'next/navigation'
import { resolveProvisionedUser } from '@/lib/auth-server'
import MfaSetup from './setup'

export const dynamic = 'force-dynamic'
export default async function MfaPage() {
  const user = await resolveProvisionedUser().catch(() => null)
  if (!user) redirect('/login')
  if (!user.isOfficeAdmin) redirect('/dashboard')
  return <MfaSetup />
}
