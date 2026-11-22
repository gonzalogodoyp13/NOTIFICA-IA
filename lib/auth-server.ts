import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'

import { AuthResolutionError, resolveCanonicalUser, type AuthFailureCode, type AuthUser } from './auth-core'
import { prisma } from './prisma'
import { createServerSupabaseClient } from './supabaseServer'
import { OwnerEmailError, requireOwnerEmail } from './auth/ownerEmail'

export { AuthResolutionError, type AuthFailureCode, type AuthUser }

export async function resolveProvisionedUser(): Promise<AuthUser> {
  return resolveCanonicalUser({
    getAuthUser: async () => {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.getUser()
      return { user: data.user ? { id: data.user.id } : null, error }
    },
    findUserByAuthUserId: async authUserId => {
      const user = await prisma.user.findUnique({
        where: { authUserId },
        select: {
          id: true,
          authUserId: true,
          email: true,
          officeId: true,
          officeName: true,
          isOfficeAdmin: true,
          isActive: true,
          office: { select: { cacheRevision: true } },
        },
      })
      if (!user) return null
      const { office, ...localUser } = user
      return { ...localUser, officeCacheRevision: office.cacheRevision }
    },
  })
}

export async function resolveAuthenticatedUser(): Promise<AuthUser> {
  const user=await resolveProvisionedUser()
  const grant=await prisma.platformGrant.findUnique({where:{userId:user.id}})
  if(grant?.role==='OWNER'&&!grant.revokedAt&&grant.verificationMethod==='EMAIL') {
    try {await requireOwnerEmail(user,false,grant)} catch(error) {
      if(error instanceof OwnerEmailError)throw new AuthResolutionError('EMAIL_VERIFICATION_REQUIRED','Verifica el código enviado a tu correo.',403)
      throw error
    }
  }
  return user
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
