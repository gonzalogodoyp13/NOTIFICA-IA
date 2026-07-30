import { describe, expect, it } from 'vitest'

import { retryDelayMinutes } from '../../lib/audit/outboxCore'

describe('activity outbox retry policy', () => {
  it('uses the required 1, 5, 15, and 60 minute backoff', () => {
    expect([1, 2, 3, 4, 9].map(retryDelayMinutes)).toEqual([1, 5, 15, 60, 60])
  })
})
