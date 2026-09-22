import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { automaticSigningConfig } from '../../lib/signing/automaticConfig'
import { completionSigningKey } from '../../lib/signing/automaticEnqueue'

describe('automatic signing rollout and request identity', () => {
  const fingerprint = 'a'.repeat(64)
  it('defaults off and requires explicit per-office configuration', () => {
    expect(automaticSigningConfig(1, {})).toBeNull()
    expect(automaticSigningConfig(1, { SIGNING_AUTO_ENQUEUE_ENABLED: 'false', SIGNING_AUTO_ENQUEUE_OFFICES: 'invalid' })).toBeNull()
    const env = { SIGNING_AUTO_ENQUEUE_ENABLED: 'true', SIGNING_AUTO_ENQUEUE_OFFICES: JSON.stringify({ 1: { signerFingerprint: fingerprint } }) }
    expect(automaticSigningConfig(1, env)).toEqual({ signerFingerprint: fingerprint, requestedLevel: 'PADES_LT' })
    expect(automaticSigningConfig(2, env)).toBeNull()
  })
  it('rejects malformed enabled configuration with a fixed message', () => {
    for (const raw of ['invalid-secret-value', '{"1":{"signerFingerprint":"bad"}}', '{"1":{"signerFingerprint":"' + fingerprint + '","requestedLevel":"PADES_X"}}']) {
      expect(() => automaticSigningConfig(1, { SIGNING_AUTO_ENQUEUE_ENABLED: 'true', SIGNING_AUTO_ENQUEUE_OFFICES: raw }))
        .toThrow('Invalid automatic signing configuration')
    }
    expect(() => automaticSigningConfig(1, { SIGNING_AUTO_ENQUEUE_ENABLED: 'yes' })).toThrow()
  })
  it('selects basic signing per office while preserving the LT default elsewhere', () => {
    const env = { SIGNING_AUTO_ENQUEUE_ENABLED: 'true', SIGNING_AUTO_ENQUEUE_OFFICES: JSON.stringify({
      1: { signerFingerprint: fingerprint, requestedLevel: 'PADES_B' }, 2: { signerFingerprint: fingerprint },
    }) }
    expect(automaticSigningConfig(1, env)?.requestedLevel).toBe('PADES_B')
    expect(automaticSigningConfig(2, env)?.requestedLevel).toBe('PADES_LT')
    expect(automaticSigningConfig(3, env)).toBeNull()
  })
  it('hashes canonical source IDs/checksums and every completion/signer scope component', () => {
    const versions = [{ id: 'b', checksumSha256: fingerprint }, { id: 'a', checksumSha256: fingerprint }]
    const key = completionSigningKey(1, 'diligence', 'event', versions, fingerprint, 'PADES_LT')
    expect(completionSigningKey(1, 'diligence', 'event', [...versions].reverse(), fingerprint, 'PADES_LT')).toBe(key)
    for (const changed of [
      completionSigningKey(2, 'diligence', 'event', versions, fingerprint, 'PADES_LT'),
      completionSigningKey(1, 'other', 'event', versions, fingerprint, 'PADES_LT'),
      completionSigningKey(1, 'diligence', 'other', versions, fingerprint, 'PADES_LT'),
      completionSigningKey(1, 'diligence', 'event', [{ id: 'a', checksumSha256: 'b'.repeat(64) }], fingerprint, 'PADES_LT'),
      completionSigningKey(1, 'diligence', 'event', versions, 'b'.repeat(64), 'PADES_LT'),
      completionSigningKey(1, 'diligence', 'event', versions, fingerprint, 'PADES_LTA'),
      completionSigningKey(1, 'diligence', 'event', versions, fingerprint, 'PADES_B'),
    ]) expect(changed).not.toBe(key)
  })
})
