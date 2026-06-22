import { describe, expect, it } from 'vitest'

import { sendWithRetries, type RetryMailAdapter } from '../../lib/recibos/mail-retry'

describe('receipt mail retry behavior', () => {
  it('retries a failing email exactly three times before stopping', async () => {
    let attempts = 0
    const adapter: RetryMailAdapter = {
      provider: 'mock',
      async send() {
        attempts += 1
        throw new Error('mock failure')
      },
    }

    await expect(sendWithRetries(adapter, {
      to: ['persona@example.com'],
      subject: 'Test',
      text: 'Body',
      attachments: [],
    }, 3)).rejects.toThrow('mock failure')
    expect(attempts).toBe(3)
  })
})
