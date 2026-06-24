// Logout route handler
// Handles user sign-out and redirects to login page
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { recordActivityEvent } from '@/lib/audit/activityEvent'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const user = await getCurrentUserWithOffice()
    if (user) {
      await recordActivityEvent({
        userId: user.id,
        officeId: user.officeId,
        eventType: 'auth.logout',
        module: 'auth',
        result: 'success',
        recordType: 'user',
        recordId: user.id,
        shortName: user.email,
        description: 'Cierre de sesion.',
      })
    }
  } catch (error) {
    // Continue with logout even if logging fails
    console.error('Error getting user for logout log:', error)
  }

  // Sign out the user
  const supabase = createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}

