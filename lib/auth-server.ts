import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'

import { AuthResolutionError, resolveCanonicalUser, type AuthFailureCode, type AuthUser } from './auth-core'
import { prisma } from './prisma'
import { createServerSupabaseClient } from './supabaseServer'

export { AuthResolutionError, type AuthFailureCode, type AuthUser }

export async function resolveAuthenticatedUser(): Promise<AuthUser> {
  return resolveCanonicalUser({
    getAuthUser: async () => {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.auth.getUser()
      return { user: data.user ? { id: data.user.id } : null, error }
    },
    findUserByAuthUserId: authUserId => prisma.user.findUnique({
      where: { authUserId },
      select: { id: true, authUserId: true, email: true, officeId: true, officeName: true, isOfficeAdmin: true, isActive: true },
    }),
  })
}

export const getCachedAuthenticatedUser = cache(resolveAuthenticatedUser)

/** Compatibility helper for server components while callers migrate to the strict resolver. */
export async function getCurrentUserWithOffice(): Promise<AuthUser | null> {
  try {
    return await getCachedAuthenticatedUser()
  } catch (error) {
    if (error instanceof AuthResolutionError && error.code !== 'SERVICE_UNAVAILABLE') return null
    throw error
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  return getCurrentUserWithOffice()
}

export async function getSession(): Promise<{ email: string } | null> {
  const user = await getCurrentUserWithOffice()
  return user ? { email: user.email } : null
}

export async function requireSession(): Promise<{ email: string }> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}
