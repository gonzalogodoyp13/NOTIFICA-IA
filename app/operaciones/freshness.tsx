'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
/** Refresh only the open diagnostic view; never run a business operation. */
export default function Freshness({ refreshedAt, autoRefresh = true }: { refreshedAt: string; autoRefresh?: boolean }) {
  const router = useRouter(), [stale, setStale] = useState(false)
  useEffect(() => {
    const check = () => setStale(!navigator.onLine || Date.now() - Date.parse(refreshedAt) > 60000)
    const refresh = () => { check(); if (autoRefresh && document.visibilityState === 'visible' && navigator.onLine) router.refresh() }
    check()
    const clock = setInterval(check, 10000), poll = setInterval(refresh, 30000)
    window.addEventListener('offline', check); document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(clock); clearInterval(poll); window.removeEventListener('offline', check); document.removeEventListener('visibilitychange', refresh) }
  }, [refreshedAt, router, autoRefresh])
  return stale ? <p role="status" className="ops-stale-view">Vista sin evidencia reciente o sin conexión. Los estados mostrados son históricos; actualiza antes de interpretarlos como actuales.</p> : <p className="ops-caption">{autoRefresh ? 'La vista visible se actualiza cada 30 segundos.' : 'Actualización manual para conservar tus notas mientras editas.'}</p>
}
