import 'server-only'
import { redirect } from 'next/navigation'
import { resolveProvisionedUser, AuthResolutionError } from '@/lib/auth-server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { prisma } from '@/lib/prisma'
import { permits, type PlatformPermission } from './policy'
import { recentMfa, type RecoveryAction } from './recovery-policy'
import { OwnerEmailError, requireOwnerEmail } from '@/lib/auth/ownerEmail'

export class OperationsAccessError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
/** Bootstrap eligibility only. Does not authorize any operational data. */
export async function requireOwnerEnrollment() {
  const user = await resolveProvisionedUser()
  const grant = await prisma.platformGrant.findUnique({ where: { userId: user.id } })
  if (!grant || grant.revokedAt || !permits(grant.role, 'operations.read')) throw new OperationsAccessError(403, 'PLATFORM_ACCESS_DENIED')
  return user
}
export async function requirePlatformOwner(permission: PlatformPermission = 'operations.read') {
  const user = await requireOwnerEnrollment()
  if (!permits('OWNER', permission)) throw new OperationsAccessError(403, 'PLATFORM_ACCESS_DENIED')
  const grant=await prisma.platformGrant.findUnique({where:{userId:user.id}})
  if(grant?.verificationMethod==='EMAIL') {
    try {await requireOwnerEmail(user,false,grant)} catch(error) {
      if(error instanceof OwnerEmailError)throw new OperationsAccessError(error.status,'MFA_REQUIRED')
      throw error
    }
    return user
  }
  const client = await createServerSupabaseClient()
  // getClaims verifies the token; never decode an unverified cookie for AAL.
  const { data, error } = await client.auth.getClaims()
  if (error || data?.claims.sub !== user.authUserId || data.claims.aal !== 'aal2') throw new OperationsAccessError(403, 'MFA_REQUIRED')
  const factors = await client.auth.mfa.listFactors()
  if (factors.error || !factors.data.all.some(f => f.status === 'verified')) throw new OperationsAccessError(403, 'MFA_REQUIRED')
  if (!permits('OWNER', permission)) throw new OperationsAccessError(403, 'PLATFORM_ACCESS_DENIED')
  return user
}
export async function requireOwnerPage() {
  try { return await requirePlatformOwner() } catch (error) {
    if (error instanceof OperationsAccessError && error.code === 'MFA_REQUIRED') redirect('/mfa')
    if (error instanceof OperationsAccessError) redirect('/dashboard?notice=acceso-restringido')
    if (error instanceof AuthResolutionError && error.status < 500) redirect('/login')
    throw error
  }
}
export async function requireRecoveryOwner(action: RecoveryAction) {
  const user = await requirePlatformOwner(`recovery.${action}`)
  if (!['diagnostics','reconcile'].includes(action)) {
    const grant=await prisma.platformGrant.findUnique({where:{userId:user.id}})
    if(grant?.verificationMethod==='EMAIL') {
      try {await requireOwnerEmail(user,true,grant)}catch(error){
        if(error instanceof OwnerEmailError)throw new OperationsAccessError(error.status,'RECENT_MFA_REQUIRED')
        throw error
      }
      return user
    }
    const client = await createServerSupabaseClient(), { data, error } = await client.auth.getClaims()
    if (error || data?.claims.sub !== user.authUserId || !recentMfa(data.claims)) throw new OperationsAccessError(403, 'RECENT_MFA_REQUIRED')
  }
  return user
}
