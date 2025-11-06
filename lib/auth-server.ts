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

    // Use getSession() for better cookie reading
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session?.user?.email) {
      // Fallback to getUser() if getSession() fails
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user?.email) {
        return null
      }
      return { email: userData.user.email }
    }

    return { email: sessionData.session.user.email }
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

    // Debug: Log auth cookies
    const authCookies = cookieStore.getAll().filter(cookie => 
      cookie.name.includes('sb-') || cookie.name.includes('supabase')
    )
    console.log('[getCurrentUser] Auth cookies found:', authCookies.map(c => c.name))

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            const value = cookieStore.get(name)?.value
            if (name.includes('sb-') || name.includes('supabase')) {
              console.log(`[getCurrentUser] Cookie ${name}:`, value ? 'present' : 'missing')
            }
            return value
          },
          set() {},
          remove() {},
        },
      }
    )

    const { data, error } = await supabase.auth.getUser()

    if (error) {
      console.log('[getCurrentUser] Supabase auth error:', error.message)
      return null
    }

    if (!data?.user) {
      console.log('[getCurrentUser] No user data returned from Supabase')
      return null
    }

    console.log('[getCurrentUser] User found:', { id: data.user.id, email: data.user.email })
    return {
      id: data.user.id,
      email: data.user.email || '',
      metadata: data.user.user_metadata || {},
    }
  } catch (error) {
    console.error('[getCurrentUser] Exception:', error)
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

    // Debug: Log all cookies to see what's available
    const allCookies = cookieStore.getAll()
    const authCookies = allCookies.filter(cookie => 
      cookie.name.includes('sb-') || cookie.name.includes('supabase')
    )
    console.log('[getCurrentUserWithOffice] All cookies:', allCookies.map(c => c.name))
    console.log('[getCurrentUserWithOffice] Auth cookies found:', authCookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`))

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            const value = cookieStore.get(name)?.value
            if (name.includes('sb-') || name.includes('supabase') || name.includes('auth')) {
              console.log(`[getCurrentUserWithOffice] Reading cookie ${name}:`, value ? 'present' : 'missing')
            }
            return value
          },
          set() {},
          remove() {},
        },
      }
    )

    // Use getSession() instead of getUser() for better cookie reading
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      console.log('[getCurrentUserWithOffice] Session error:', sessionError.message)
      return null
    }

    if (!sessionData?.session?.user) {
      console.log('[getCurrentUserWithOffice] No session found')
      // Fallback to getUser() if getSession() doesn't work
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user) {
        console.log('[getCurrentUserWithOffice] getUser() also failed:', userError?.message || 'No user data')
        return null
      }
      console.log('[getCurrentUserWithOffice] getUser() succeeded, using fallback')
      
      const userEmail = userData.user.email!
      
      // Use upsert to create user if doesn't exist, or get existing one
      const dbUser = await prisma.user.upsert({
        where: { email: userEmail },
        update: {}, // If user exists, don't update anything
        create: {
          email: userEmail,
          officeName: userData.user.user_metadata?.officeName || 
                     `Oficina de ${userEmail.split('@')[0]}` || 
                     'Oficina de Receptor',
        },
      })

      return {
        id: dbUser.id,
        email: dbUser.email,
        officeId: 1, // Default officeId until schema is updated
      }
    }

    console.log('[getCurrentUserWithOffice] Session found for user:', sessionData.session.user.email)

    const userEmail = sessionData.session.user.email!
    
    // Use upsert to create user if doesn't exist, or get existing one
    // This ensures automatic user creation on first login
    const dbUser = await prisma.user.upsert({
      where: { email: userEmail },
      update: {}, // If user exists, don't update anything
      create: {
        email: userEmail,
        officeName: sessionData.session.user.user_metadata?.officeName || 
                   `Oficina de ${userEmail.split('@')[0]}` || 
                   'Oficina de Receptor',
      },
    })

    console.log('[getCurrentUserWithOffice] Successfully authenticated user:', { id: dbUser.id, email: dbUser.email })
    
    // TODO: When User model is updated with officeId field, use dbUser.officeId
    // For now, each user represents one office, so we use a default value
    return {
      id: dbUser.id,
      email: dbUser.email,
      officeId: 1, // Default officeId until schema is updated
    }
  } catch (error) {
    console.error('[getCurrentUserWithOffice] Exception:', error)
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
