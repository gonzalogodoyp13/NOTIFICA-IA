import 'server-only'

import { BoundedTtlCache } from '@/lib/cache/boundedTtlCache'

export const OFFICE_CACHE_TTL_MS = 5 * 60 * 1000
export const TRANSIENT_ASSET_FALLBACK_TTL_MS = 30 * 1000

export const officeCatalogCache = new BoundedTtlCache<unknown>({
  maxEntries: 512,
  defaultTtlMs: OFFICE_CACHE_TTL_MS,
})

export const officeBinaryCache = new BoundedTtlCache<Uint8Array>({
  maxEntries: 64,
  maxWeight: 32 * 1024 * 1024,
  defaultTtlMs: OFFICE_CACHE_TTL_MS,
  weightOf: value => value.byteLength,
})

export function officeCacheKey(
  namespace: string,
  officeId: number,
  revision: number,
  ...parts: Array<string | number | null | undefined>
) {
  return [namespace, `office=${officeId}`, `revision=${revision}`, ...parts.map(value => String(value ?? ''))].join(':')
}

export function invalidateOfficeCaches(officeId: number) {
  const marker = `:office=${officeId}:`
  officeCatalogCache.invalidate(key => key.includes(marker))
  officeBinaryCache.invalidate(key => key.includes(marker))
}
