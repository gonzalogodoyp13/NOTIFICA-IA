import { describe, expect, it } from 'vitest'

import { finalBatchStatus, sanitizeDispatchError, sha256Hex } from '../../lib/recibos/dispatch-history-core'

describe('recibos dispatch history helpers', () => {
  it('derives batch status from recipient outcomes', () => {
    expect(finalBatchStatus({ sent: 2, failed: 0 })).toBe('sent')
    expect(finalBatchStatus({ sent: 0, failed: 1 })).toBe('failed')
    expect(finalBatchStatus({ sent: 1, failed: 1 })).toBe('partial')
  })

  it('sanitizes provider error messages before storing them', () => {
    expect(sanitizeDispatchError(new Error('SMTP password: super-secret token=abc123 failed'))).toBe('SMTP password=[redacted] token=[redacted] failed')
  })

  it('hashes attachment bytes without storing attachment content', () => {
    expect(sha256Hex(Buffer.from('recibos'))).toBe('4e75d70c4d4324c282b0831584334c870c22c81d33ae668348a8cb45f3d9c8c9')
  })
})
