import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
vi.mock('server-only', () => ({}))
import { requireDeviceBrowserOrigin } from '../../lib/signing/deviceHttp'

const publicOrigin = 'https://visitors-via-missed-remain.trycloudflare.com'
const proxied = (origin = publicOrigin, extra: Record<string, string> = {}) =>
  new NextRequest('https://127.0.0.1:3000/api/signing/devices', {
    method: 'POST', headers: { origin, 'x-forwarded-proto': 'https', ...extra },
  })

describe('browser device administration origin', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('accepts the pinned public origin when Next uses the internal proxy address', () => {
    vi.stubEnv('SIGNING_TRUST_PROXY', 'true')
    vi.stubEnv('SIGNING_BROWSER_ORIGIN', publicOrigin)
    expect(() => requireDeviceBrowserOrigin(proxied())).not.toThrow()
  })

  it('rejects foreign, missing and null origins even with matching forwarded hosts', () => {
    vi.stubEnv('SIGNING_TRUST_PROXY', 'true')
    vi.stubEnv('SIGNING_BROWSER_ORIGIN', publicOrigin)
    for (const origin of ['https://attacker.test', 'null', '', 'https://127.0.0.1:3000']) {
      expect(() => requireDeviceBrowserOrigin(proxied(origin, {
        host: 'attacker.test', 'x-forwarded-host': 'attacker.test',
      }))).toThrow('ORIGIN_REQUIRED')
    }
    const request = proxied()
    request.headers.delete('origin')
    expect(() => requireDeviceBrowserOrigin(request)).toThrow('ORIGIN_REQUIRED')
  })

  it('does not trust an unconfigured proxy host as the public origin', () => {
    vi.stubEnv('SIGNING_TRUST_PROXY', 'true')
    vi.stubEnv('SIGNING_BROWSER_ORIGIN', '')
    expect(() => requireDeviceBrowserOrigin(proxied(publicOrigin, {
      host: new URL(publicOrigin).host, 'x-forwarded-host': new URL(publicOrigin).host,
    }))).toThrow('ORIGIN_REQUIRED')
  })

  it('requires trusted HTTPS even when the public origin matches', () => {
    vi.stubEnv('SIGNING_BROWSER_ORIGIN', publicOrigin)
    vi.stubEnv('SIGNING_TRUST_PROXY', 'false')
    expect(() => requireDeviceBrowserOrigin(proxied())).toThrow('HTTPS_REQUIRED')
    vi.stubEnv('SIGNING_TRUST_PROXY', 'true')
    expect(() => requireDeviceBrowserOrigin(proxied(publicOrigin, {
      'x-forwarded-proto': 'http',
    }))).toThrow('HTTPS_REQUIRED')
  })

  it('rejects malformed and unsafe public origin configurations', () => {
    vi.stubEnv('SIGNING_TRUST_PROXY', 'true')
    for (const configured of ['*', 'not-a-url', 'http://example.test',
      'https://user:pass@example.test', `${publicOrigin}/login`,
      `${publicOrigin}/?query=1`, `${publicOrigin}/#fragment`]) {
      vi.stubEnv('SIGNING_BROWSER_ORIGIN', configured)
      expect(() => requireDeviceBrowserOrigin(proxied())).toThrow('ORIGIN_REQUIRED')
    }
  })

  it('keeps the same-origin check for direct HTTPS requests', () => {
    vi.stubEnv('SIGNING_TRUST_PROXY', 'false')
    vi.stubEnv('SIGNING_BROWSER_ORIGIN', '')
    expect(() => requireDeviceBrowserOrigin(new NextRequest(`${publicOrigin}/api/signing/devices`, {
      headers: { origin: publicOrigin },
    }))).not.toThrow()
    expect(() => requireDeviceBrowserOrigin(new NextRequest(`${publicOrigin}/api/signing/devices`, {
      headers: { origin: 'https://attacker.test' },
    }))).toThrow('ORIGIN_REQUIRED')
    vi.stubEnv('SIGNING_BROWSER_ORIGIN', publicOrigin)
    expect(() => requireDeviceBrowserOrigin(new NextRequest(`${publicOrigin}/api/signing/devices`, {
      headers: { origin: publicOrigin },
    }))).toThrow('ORIGIN_REQUIRED')
  })
})
