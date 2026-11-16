// Logout route handler
// Handles user sign-out and redirects to login page
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'
import { requireApiUser } from '@/lib/api/server'
import { recordBestEffortEvent } from '@/lib/audit/activityEvent'
import { requireSameOrigin } from '@/lib/security/request'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try { requireSameOrigin(req) } catch { return new Response(null, { status: 403 }) }
  try {
    const user = await requireApiUser(req)
    if (user) {
      await recordBestEffortEvent(user, {
        eventType: 'auth.logout',
        module: 'auth',
        result: 'success',
        recordType: 'user',
        recordId: user.id,
        description: 'Cierre de sesion.',
      })
    }
  } catch (error) {
    // Continue with logout even if logging fails
    console.error('Error getting user for logout log:', error)
  }

  // Sign out the user
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}

