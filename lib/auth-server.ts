// Server-side authentication utilities
// These functions use cookies and can only be called from Server Components or API routes
import 'server-only'

import { createServerSupabaseClient } from './supabaseServer'
import { redirect } from 'next/navigation'

/**
 * Get the current user session (server-side)
 * Reads session from cookies to maintain persistence
 * @returns User email if authenticated, null otherwise
 */
export async function getSession(): Promise<{ email: string } | null> {
  try {
    // Use server client that reads cookies
    const supabaseServer = createServerSupabaseClient()
    const { data: { session }, error } = await supabaseServer.auth.getSession()

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
 * Get the current authenticated user (server-side)
 * Returns full user information from Supabase session
 * @returns User object with id, email, and metadata, or null if not authenticated
 */
export async function getCurrentUser(): Promise<{
  id: string
  email: string
  metadata: Record<string, any>
} | null> {
  try {
    const supabaseServer = createServerSupabaseClient()
    const { data: { session }, error } = await supabaseServer.auth.getSession()

    if (error || !session?.user) {
      return null
    }

    return {
      id: session.user.id,
      email: session.user.email || '',
      metadata: session.user.user_metadata || {},
    }
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

/**
 * Require authentication for protected routes
 * Redirects to /login if user is not authenticated
 * @returns User email if authenticated
 */
export async function requireSession(): Promise<{ email: string }> {
  const session = await getSession()

  if (!session) {
    // Redirect to login page if not authenticated
    redirect('/login')
  }

  return session
}

