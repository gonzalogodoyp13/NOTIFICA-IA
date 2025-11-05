// Homepage component
// Landing page for NOTIFICA IA
// Redirects based on authentication status
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSession()
  if (!session) redirect('/login')
  else redirect('/dashboard')
}

