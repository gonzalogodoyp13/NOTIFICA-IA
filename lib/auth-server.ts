// Server-side authentication utilities
// These functions use cookies and can only be called from Server Components or API routes
import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from './prisma'

/**
 * Get the current user session (server-side)
 * Reads session from cookies to maintain persistence
 * @returns User email if authenticated, null otherwise
 */
export async function getSession(): Promise<{ email: string } | null> {
  try {
    const cookieStore = cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {},
          remove() {},
        },
      }
    )

    const { data, error } = await supabase.auth.getUser()

    if (error || !data?.user?.email) {
      return null
    }

    return { email: data.user.email }
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
    const cookieStore = cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {},
          remove() {},
        },
      }
    )

    const { data, error } = await supabase.auth.getUser()

    if (error || !data?.user) {
      return null
    }

    return {
      id: data.user.id,
      email: data.user.email || '',
      metadata: data.user.user_metadata || {},
    }
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

/**
 * Get the current authenticated user with officeId from database
 * Returns user information including officeId for scoping queries
 * Uses official Supabase SSR authentication handling
 * @returns User object with id, email, and officeId, or null if not authenticated
 */
export async function getCurrentUserWithOffice(): Promise<{
  id: string
  email: string
  officeId: number
} | null> {
  try {
    const cookieStore = cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {},
          remove() {},
        },
      }
    )

    const { data, error } = await supabase.auth.getUser()

    if (error || !data?.user) {
      return null
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: data.user.email! },
    })

    if (!dbUser) {
      return null
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      officeId: dbUser.officeId ?? 1,
    }
  } catch (error) {
    console.error('Error getting current user with office:', error)
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

