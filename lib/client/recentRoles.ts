import type { RecentRole } from '@/lib/dashboard/types'

const STORAGE_KEY = 'notifica.recentRoles.v1'

export function readRecentRoles(): RecentRole[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value.slice(0, 10) : []
  } catch {
    return []
  }
}

export function rememberRecentRole(role: RecentRole) {
  if (typeof window === 'undefined') return
  const next = [role, ...readRecentRoles().filter(item => item.id !== role.id)].slice(0, 10)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}
