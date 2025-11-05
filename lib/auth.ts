// Authentication utilities using Supabase Auth
// All authentication goes through Supabase's HTTPS API (no direct database access)
import { supabase } from './supabaseClient'
import { redirect } from 'next/navigation'

/**
 * Get the current user session
 * @returns User email if authenticated, null otherwise
 */
export async function getSession(): Promise<{ email: string } | null> {
  try {
    // Get the current session from Supabase
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session?.user?.email) {
      return null
    }

    return { email: session.user.email }
  } catch (error) {
    console.error('Error getting session:', error)
    return null
  }
}

/**
 * Require authentication for protected routes
 * Redirects to /signin if user is not authenticated
 * @returns User email if authenticated
 */
export async function requireSession(): Promise<{ email: string }> {
  const session = await getSession()

  if (!session) {
    // Redirect to sign-in page if not authenticated
    redirect('/signin')
  }

  return session
}

/**
 * Sign in with email and password
 * @param email User email
 * @param password User password
 * @returns Success status and optional error message
 */
export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    }
  }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
    }
  } catch (error) {
    console.error('Error signing out:', error)
  }
}


