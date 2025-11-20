// Protected layout for authenticated routes
// This layout ensures all child routes require authentication
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth-server'
import TopBar from './_components/TopBar'

export const dynamic = 'force-dynamic'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Check if user is authenticated
  const session = await getSession()

  // Redirect to login if not authenticated
  if (!session) {
    redirect('/login')
  }

  // Render children if authenticated
  return (
    <>
      <TopBar />
      <main>{children}</main>
    </>
  )
}

