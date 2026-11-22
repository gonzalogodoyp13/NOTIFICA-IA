'use client'
import { evidence } from './core'
const seen = new WeakMap<object, Promise<string | null>>()
let sent = 0
export function reportBrowserError(error: unknown): Promise<string | null> {
  if (error && typeof error === 'object' && seen.has(error)) return seen.get(error)!
  const task = (async () => {
    if (sent++ >= 10) return null
    try {
      const response = await fetch('/api/diagnostics/browser', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...evidence(error), clientRelease: process.env.NEXT_PUBLIC_APP_RELEASE }),
        signal: AbortSignal.timeout(5000),
      })
      return response.ok ? (await response.json()).supportReference as string : null
    } catch { return null }
  })()
  if (error && typeof error === 'object') seen.set(error, task)
  return task
}
