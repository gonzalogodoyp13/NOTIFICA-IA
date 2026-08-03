// Protected layout for authenticated routes
// This layout ensures all child routes require authentication
import { redirect } from 'next/navigation'
import { AuthResolutionError, getCachedAuthenticatedUser } from '@/lib/auth-server'
import TopBar from './_components/TopBar'
import ProtectedQueryProvider from './_components/ProtectedQueryProvider'

export const dynamic = 'force-dynamic'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Check if user is authenticated
  let user
  try {
    user = await getCachedAuthenticatedUser()
  } catch (error) {
    if (error instanceof AuthResolutionError) {
      if (error.code === 'ACCOUNT_DISABLED') redirect('/auth/disabled')
      if (error.code === 'USER_NOT_PROVISIONED') redirect('/login?error=user_not_provisioned')
      if (error.code === 'SERVICE_UNAVAILABLE') redirect('/login?error=service_unavailable')
    }
    redirect('/login?error=invalid_session')
  }

  // Render children if authenticated
  return (
    <ProtectedQueryProvider officeId={user.officeId} initialCacheRevision={user.officeCacheRevision}>
      <TopBar />
      <main>{children}</main>
    </ProtectedQueryProvider>
  )
}

