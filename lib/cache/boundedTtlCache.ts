export type BoundedTtlCacheOptions<T> = {
  maxEntries: number
  maxWeight?: number
  defaultTtlMs: number
  weightOf?: (value: T) => number
  now?: () => number
}

type Entry<T> = {
  value: T
  expiresAt: number
  weight: number
}

export type DynamicCacheValue<T> = {
  value: T
  ttlMs?: number
  weight?: number
}

export class BoundedTtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>()
  private readonly inFlight = new Map<string, Promise<T>>()
  private totalWeight = 0

  constructor(private readonly options: BoundedTtlCacheOptions<T>) {}

  get size() {
    this.pruneExpired()
    return this.entries.size
  }

  get weight() {
    this.pruneExpired()
    return this.totalWeight
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.remove(key)
      return undefined
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, ttlMs = this.options.defaultTtlMs, weight?: number) {
    this.remove(key)
    const entryWeight = Math.max(0, weight ?? this.options.weightOf?.(value) ?? 1)
    this.entries.set(key, {
      value,
      expiresAt: this.now() + Math.max(1, ttlMs),
      weight: entryWeight,
    })
    this.totalWeight += entryWeight
    this.evictToLimits()
    return value
  }

  async getOrLoad(
    key: string,
    loader: () => Promise<T>,
    options?: { ttlMs?: number; weight?: number }
  ): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) return cached
    const pending = this.inFlight.get(key)
    if (pending) return pending

    const promise = loader()
      .then(value => this.set(key, value, options?.ttlMs, options?.weight))
      .finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, promise)
    return promise
  }

  async getOrLoadDynamic(
    key: string,
    loader: () => Promise<DynamicCacheValue<T>>
  ): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) return cached
    const pending = this.inFlight.get(key)
    if (pending) return pending

    const promise = loader()
      .then(result => this.set(key, result.value, result.ttlMs, result.weight))
      .finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, promise)
    return promise
  }

  invalidate(predicate: (key: string) => boolean) {
    for (const key of Array.from(this.entries.keys())) {
      if (predicate(key)) this.remove(key)
    }
  }

  clear() {
    this.entries.clear()
    this.inFlight.clear()
    this.totalWeight = 0
  }

  private now() {
    return this.options.now?.() ?? Date.now()
  }

  private remove(key: string) {
    const current = this.entries.get(key)
    if (!current) return
    this.totalWeight -= current.weight
    this.entries.delete(key)
  }

  private pruneExpired() {
    const now = this.now()
    for (const [key, entry] of Array.from(this.entries.entries())) {
      if (entry.expiresAt <= now) this.remove(key)
    }
  }

  private evictToLimits() {
    this.pruneExpired()
    const maxWeight = this.options.maxWeight ?? Number.POSITIVE_INFINITY
    while (this.entries.size > this.options.maxEntries || this.totalWeight > maxWeight) {
      const oldestKey = this.entries.keys().next().value as string | undefined
      if (!oldestKey) break
      this.remove(oldestKey)
    }
  }
}
