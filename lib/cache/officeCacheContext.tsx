'use client'

import { createContext, useContext } from 'react'

export type OfficeCacheContextValue = {
  officeId: number
  cacheRevision: number
  advanceCacheRevision(next: number): void
}

export const OfficeCacheContext = createContext<OfficeCacheContextValue | null>(null)

export function useOfficeCacheContext() {
  const value = useContext(OfficeCacheContext)
  if (!value) throw new Error('useOfficeCacheContext must be used inside the protected layout')
  return value
}
