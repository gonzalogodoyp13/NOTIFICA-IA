'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { OfficeCacheContext } from '@/lib/cache/officeCacheContext'

export default function ProtectedQueryProvider(props: {
  officeId: number
  initialCacheRevision: number
  children: ReactNode
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 30 * 60 * 1000 },
    },
  }))
  const [cacheRevision, setCacheRevision] = useState(props.initialCacheRevision)
  const advanceCacheRevision = useCallback((next: number) => setCacheRevision(current => Math.max(current, next)), [])
  const context = useMemo(() => ({ officeId: props.officeId, cacheRevision, advanceCacheRevision }), [props.officeId, cacheRevision, advanceCacheRevision])

  return (
    <QueryClientProvider client={queryClient}>
      <OfficeCacheContext.Provider value={context}>{props.children}</OfficeCacheContext.Provider>
    </QueryClientProvider>
  )
}
