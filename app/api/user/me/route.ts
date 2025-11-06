// API route: /api/user/me
// Returns information about the currently authenticated user
// Requires valid Supabase session (via cookies)
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { cookies } from 'next/headers'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Debug: Log cookies to verify they're being received
    const cookieStore = cookies()
    const authCookies = cookieStore.getAll().filter(cookie => 
      cookie.name.includes('sb-') || cookie.name.includes('supabase')
    )
    console.log('[API /user/me] Auth cookies received:', authCookies.map(c => c.name))

    // Get current authenticated user from session
    const user = await getCurrentUser()

    console.log('[API /user/me] User lookup result:', user ? { id: user.id, email: user.email } : 'null')

    // If no user session, return 401 Unauthorized
    if (!user) {
      console.log('[API /user/me] No user found - returning 401')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Return user information
    console.log('[API /user/me] Returning user data:', { id: user.id, email: user.email })
    return NextResponse.json({
      id: user.id,
      email: user.email,
      metadata: user.metadata,
    })
  } catch (error) {
    console.error('[API /user/me] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
