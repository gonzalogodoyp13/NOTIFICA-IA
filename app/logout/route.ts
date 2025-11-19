// Logout route handler
// Handles user sign-out and redirects to login page
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Logout event - middleware handles logging automatically
  } catch (error) {
    // Continue with logout even if logging fails
    console.error('Error getting user for logout log:', error)
  }

  // Sign out the user
  const supabase = createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}

