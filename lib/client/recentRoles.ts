import type { RecentRole } from '@/lib/dashboard/types'

const LEGACY_STORAGE_KEY = 'notifica.recentRoles.v1'
export type RecentRoleScope = { userId: string; officeId: number }

function storageKey(scope: RecentRoleScope) {
  return `notifica.recentRoles.v2:${scope.officeId}:${encodeURIComponent(scope.userId)}`
}

function isRecentRole(value: unknown): value is RecentRole {
  if (!value || typeof value !== 'object') return false
  const role = value as Record<string, unknown>
  return ['id', 'rol', 'tribunal', 'caratula'].every(key => typeof role[key] === 'string')
}

export function readRecentRoles(scope: RecentRoleScope): RecentRole[] {
  if (typeof window === 'undefined') return []
  try {
    // The old history has no owner, so it must never be imported into an account.
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    const value = JSON.parse(window.localStorage.getItem(storageKey(scope)) || '[]')
    return Array.isArray(value) ? value.filter(isRecentRole).slice(0, 10) : []
  } catch {
    return []
  }
}

export function rememberRecentRole(scope: RecentRoleScope, role: RecentRole) {
  if (typeof window === 'undefined') return
  try {
    const next = [role, ...readRecentRoles(scope).filter(item => item.id !== role.id)].slice(0, 10)
    window.localStorage.setItem(storageKey(scope), JSON.stringify(next))
  } catch {
    // Browsing a case must still work when browser storage is unavailable.
  }
}
