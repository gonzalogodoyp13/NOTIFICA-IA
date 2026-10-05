import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { agentSupported, releaseVersion, requireSupportedAgent } from '../../lib/signing/agentRelease'

describe('agent release compatibility gate', () => {
  it.each(['0.11.0', '0.12.0', '1.0.0'])('accepts supported %s', version => expect(agentSupported(version, '0.11.0')).toBe(true))
  it.each([null, '0.10.99', '0.9.999', '0.11.0-preview', '01.11.0', '9999999.0.0'])('rejects old or malformed %s', version => expect(agentSupported(version, '0.11.0')).toBe(false))
  it('fails closed on a broken deployment policy', () => expect(() => agentSupported('1.0.0', 'invalid')).toThrow('AGENT_RELEASE_POLICY_INVALID'))
  it('honors the configured floor', () => {
    vi.stubEnv('SIGNING_MIN_AGENT_VERSION', '0.11.0')
    try { expect(() => requireSupportedAgent('0.10.0')).toThrow('AGENT_UPDATE_REQUIRED'); requireSupportedAgent('0.11.0') }
    finally { vi.unstubAllEnvs() }
    expect(releaseVersion('1.2.3')).toEqual([1,2,3])
  })
})
