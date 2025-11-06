// API route: /api/user/me
// Returns information about the currently authenticated user
// Requires valid Supabase session (via cookies)
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Get current authenticated user from session
    const user = await getCurrentUser()

    // If no user session, return 401 Unauthorized
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Return user information
    return NextResponse.json({
      id: user.id,
      email: user.email,
      metadata: user.metadata,
    })
  } catch (error) {
    console.error('Error in /api/user/me:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

