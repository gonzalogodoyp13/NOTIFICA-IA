import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createSystemMailAdapter } from '@/lib/email/system-mailer'
import { createMailAdapter, sendWithRetries } from '@/lib/recibos/mailer'

beforeEach(() => {
  vi.stubEnv('SYSTEM_MAIL_PROVIDER', 'resend')
  vi.stubEnv('RESEND_API_KEY', 'test-secret')
  vi.stubEnv('SYSTEM_MAIL_FROM_EMAIL', 'contacto@notificaia.cl')
  vi.stubEnv('SYSTEM_MAIL_FROM_NAME', 'NOTIFICA IA')
  vi.stubEnv('MAIL_PROVIDER', 'dry-run')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const message = () => ({
  to: ['recipient@example.test'], subject: 'Reporte', text: 'Informe adjunto',
  attachments: [{ filename: 'audit.pdf', content: Buffer.from('pdf bytes'), contentType: 'application/pdf' }],
})

describe('system email delivery', () => {
  it('sends the configured identity and attachment while leaving receipt mail separate', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-id' })))
    vi.stubGlobal('fetch', fetch)
    expect(createMailAdapter().provider).toBe('dry-run')
    const result = await createSystemMailAdapter().send({ ...message(), idempotencyKey: 'report-recipient/123' })
    expect(result).toEqual({ provider: 'resend', messageId: 'email-id' })
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(request.headers['Idempotency-Key']).toBe('report-recipient/123')
    expect(JSON.parse(request.body)).toEqual({
      from: 'NOTIFICA IA <contacto@notificaia.cl>', to: ['recipient@example.test'],
      subject: 'Reporte', text: 'Informe adjunto',
      attachments: [{ filename: 'audit.pdf', content: Buffer.from('pdf bytes').toString('base64'), content_type: 'application/pdf' }],
    })
  })
  it('reuses the same provider key on uncertain retries but gives new messages a new key', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('network timeout'))
      .mockImplementation(async () => new Response(JSON.stringify({ id: 'email-id' })))
    vi.stubGlobal('fetch', fetch)
    const adapter = createSystemMailAdapter()
    await sendWithRetries(adapter, message())
    await adapter.send(message())
    const keys = fetch.mock.calls.map(call => call[1].headers['Idempotency-Key'])
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })
  it('rejects missing credentials or invalid providers instead of simulating success', () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect(() => createSystemMailAdapter()).toThrow('RESEND_API_KEY')
    vi.stubEnv('SYSTEM_MAIL_PROVIDER', 'resned')
    expect(() => createSystemMailAdapter()).toThrow('SYSTEM_MAIL_PROVIDER')
  })
  it('does not expose provider response bodies in errors or accept malformed success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider details', { status: 403 })))
    await expect(createSystemMailAdapter().send(message())).rejects.toThrow('Resend rechazó el envío (HTTP 403).')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
    await expect(createSystemMailAdapter().send(message())).rejects.toThrow('identificador')
  })
  it('preserves legacy configuration unless explicitly switched and supports explicit dry-run', () => {
    vi.stubEnv('SYSTEM_MAIL_PROVIDER', '')
    expect(createSystemMailAdapter().provider).toBe('dry-run')
    vi.stubEnv('SYSTEM_MAIL_PROVIDER', 'dry-run')
    expect(createSystemMailAdapter().provider).toBe('dry-run')
  })
})
