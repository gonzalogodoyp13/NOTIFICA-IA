import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { MAX_SIGNING_PDF, validateSigningPdfRemote } from '../../lib/signing/pdfValidator'
const request = { source: Buffer.from('source'), signed: Buffer.from('signed'), sourceChecksum: 'a'.repeat(64),
  signerFingerprint: 'b'.repeat(64), requestedLevel: 'PADES_LT' as const }
describe('independent validator HTTP boundary', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('sends only public signing inputs to the configured HTTPS worker', async () => {
    vi.stubEnv('SIGNING_VALIDATOR_URL', 'https://validator.example/validate')
    vi.stubEnv('SIGNING_VALIDATOR_TOKEN', 't'.repeat(43))
    const evidence = { signerFingerprint: request.signerFingerprint, certificateIssuer: 'Test', providerType: 'PYHANKO_0_37_SERVER',
      level: 'PADES_LT', timestampAt: new Date().toISOString(), revocationCheckedAt: new Date().toISOString(), validatedAt: new Date().toISOString(),
      sourceChecksum: request.sourceChecksum, signedChecksum: 'c'.repeat(64), validator: 'pyHanko 0.37.0', sourcePreserved: true, offline: true, archiveTimestampCount: 0 }
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, evidence })))
    expect(await validateSigningPdfRemote(request, transport)).toEqual(evidence)
    const [url, init] = transport.mock.calls[0]
    expect(String(url)).toBe('https://validator.example/validate')
    expect(Buffer.from(init!.body as Uint8Array)).toEqual(Buffer.concat([request.source, request.signed]))
    expect(init!.redirect).toBe('error')
    expect(JSON.stringify(init)).not.toContain('service_role')
    expect(MAX_SIGNING_PDF).toBeLessThan(4_500_000)
  })
  it('rejects HTTP/embedded credentials and missing server authentication before I/O', async () => {
    const transport = vi.fn<typeof fetch>()
    vi.stubEnv('SIGNING_VALIDATOR_TOKEN', 't'.repeat(43))
    for (const url of ['http://validator.example/validate', 'https://user:pass@validator.example/validate']) {
      vi.stubEnv('SIGNING_VALIDATOR_URL', url)
      await expect(validateSigningPdfRemote(request, transport)).rejects.toThrow('VALIDATOR_NOT_CONFIGURED')
    }
    vi.stubEnv('SIGNING_VALIDATOR_URL', 'https://validator.example/validate')
    vi.stubEnv('SIGNING_VALIDATOR_TOKEN', '')
    await expect(validateSigningPdfRemote(request, transport)).rejects.toThrow('VALIDATOR_NOT_CONFIGURED')
    expect(transport).not.toHaveBeenCalled()
  })
  it('rejects oversized or unsuccessful validator responses', async () => {
    vi.stubEnv('SIGNING_VALIDATOR_URL', 'https://validator.example/validate')
    vi.stubEnv('SIGNING_VALIDATOR_TOKEN', 't'.repeat(43))
    await expect(validateSigningPdfRemote(request, vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(32769))))).rejects.toThrow('INVALID_EVIDENCE')
    await expect(validateSigningPdfRemote(request, vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 })))).rejects.toThrow('VALIDATION_FAILED')
  })
})
