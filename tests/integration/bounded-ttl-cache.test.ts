import { describe, expect, it, vi } from 'vitest'

import { BoundedTtlCache } from '../../lib/cache/boundedTtlCache'

describe('bounded TTL cache', () => {
  it('hits until the TTL expires and then reloads', async () => {
    let now = 1_000
    const cache = new BoundedTtlCache<number>({ maxEntries: 4, defaultTtlMs: 300_000, now: () => now })
    const loader = vi.fn(async () => 7)
    expect(await cache.getOrLoad('office=1:revision=1', loader)).toBe(7)
    expect(await cache.getOrLoad('office=1:revision=1', loader)).toBe(7)
    expect(loader).toHaveBeenCalledTimes(1)
    now += 300_001
    expect(await cache.getOrLoad('office=1:revision=1', loader)).toBe(7)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent loaders and does not cache rejection', async () => {
    let resolve!: (value: string) => void
    const cache = new BoundedTtlCache<string>({ maxEntries: 4, defaultTtlMs: 100 })
    const loader = vi.fn(() => new Promise<string>(done => { resolve = done }))
    const first = cache.getOrLoad('same', loader)
    const second = cache.getOrLoad('same', loader)
    resolve('loaded')
    await expect(Promise.all([first, second])).resolves.toEqual(['loaded', 'loaded'])
    expect(loader).toHaveBeenCalledTimes(1)

    const rejected = vi.fn(async () => { throw new Error('temporary') })
    await expect(cache.getOrLoad('failure', rejected)).rejects.toThrow('temporary')
    await expect(cache.getOrLoad('failure', rejected)).rejects.toThrow('temporary')
    expect(rejected).toHaveBeenCalledTimes(2)
  })

  it('uses true LRU entry eviction', () => {
    const cache = new BoundedTtlCache<number>({ maxEntries: 2, defaultTtlMs: 1000 })
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('a')).toBe(1)
    cache.set('c', 3)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
  })

  it('evicts by binary byte budget', () => {
    const cache = new BoundedTtlCache<Uint8Array>({
      maxEntries: 64,
      maxWeight: 10,
      defaultTtlMs: 1000,
      weightOf: value => value.byteLength,
    })
    cache.set('a', new Uint8Array(6))
    cache.set('b', new Uint8Array(6))
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')?.byteLength).toBe(6)
    expect(cache.weight).toBe(6)
  })

  it('isolates keys and invalidates only the requested office prefix', () => {
    const cache = new BoundedTtlCache<number>({ maxEntries: 8, defaultTtlMs: 1000 })
    cache.set('catalog:office=1:revision=1:bank=2', 1)
    cache.set('catalog:office=1:revision=2:bank=2', 2)
    cache.set('catalog:office=2:revision=1:bank=2', 3)
    cache.invalidate(key => key.includes(':office=1:'))
    expect(cache.get('catalog:office=1:revision=1:bank=2')).toBeUndefined()
    expect(cache.get('catalog:office=1:revision=2:bank=2')).toBeUndefined()
    expect(cache.get('catalog:office=2:revision=1:bank=2')).toBe(3)
  })

  it('supports a short dynamic TTL for transient fallbacks', async () => {
    let now = 0
    const cache = new BoundedTtlCache<string>({ maxEntries: 4, defaultTtlMs: 300_000, now: () => now })
    const loader = vi.fn(async () => ({ value: 'fallback', ttlMs: 30_000 }))
    await cache.getOrLoadDynamic('configured-asset', loader)
    now = 29_999
    await cache.getOrLoadDynamic('configured-asset', loader)
    expect(loader).toHaveBeenCalledTimes(1)
    now = 30_001
    await cache.getOrLoadDynamic('configured-asset', loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('makes two simulated instances miss immediately when the shared revision advances', async () => {
    const first = new BoundedTtlCache<string>({ maxEntries: 4, defaultTtlMs: 300_000 })
    const second = new BoundedTtlCache<string>({ maxEntries: 4, defaultTtlMs: 300_000 })
    const firstLoader = vi.fn(async () => 'office-config')
    const secondLoader = vi.fn(async () => 'office-config')
    await first.getOrLoad('pdf-config:office=1:revision=7', firstLoader)
    await second.getOrLoad('pdf-config:office=1:revision=7', secondLoader)
    await first.getOrLoad('pdf-config:office=1:revision=8', firstLoader)
    await second.getOrLoad('pdf-config:office=1:revision=8', secondLoader)
    expect(firstLoader).toHaveBeenCalledTimes(2)
    expect(secondLoader).toHaveBeenCalledTimes(2)
  })
})
