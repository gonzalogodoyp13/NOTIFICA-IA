import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { desktopUpdateDownload, publicDesktopUpdate } from '../../lib/signing/desktopUpdate'
import { requireSupportedAgent } from '../../lib/signing/agentRelease'
import { GET } from '../../app/api/signing/device/update-manifest/route'

const release = { version: '0.15.0', zipSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), repository: 'example/private-agent', tag: 'v0.15.0-managed.1' }
function downloadFetcher(response: Response) {
  return vi.fn().mockResolvedValueOnce(Response.json({ draft: false, assets: [{ id: 123, name: 'NOTIFICA-Windows-0.15.0-managed.zip', state: 'uploaded', digest: `sha256:${release.zipSha256}` }] })).mockResolvedValueOnce(response)
}
afterEach(() => vi.unstubAllEnvs())
function configure() { vi.stubEnv('SIGNING_DESKTOP_RELEASE', JSON.stringify(release)); vi.stubEnv('SIGNING_MIN_AGENT_VERSION', '0.0.0') }
describe('desktop update publication', () => {
  it('does not advertise an unconfigured release', async () => {
    vi.stubEnv('SIGNING_DESKTOP_RELEASE', '')
    expect(publicDesktopUpdate()).toBeNull()
    expect((await GET()).status).toBe(204)
  })
  it('publishes only version and integrity pins, never repository or credentials', async () => {
    configure(); vi.stubEnv('SIGNING_RELEASE_GITHUB_TOKEN', 'private-secret')
    const response = await GET()
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ version: release.version, zipSha256: release.zipSha256, manifestSha256: release.manifestSha256 })
  })
  it('rejects malformed publication and blocks new work from older agents', async () => {
    configure(); expect(() => requireSupportedAgent('0.14.0')).toThrow('AGENT_UPDATE_REQUIRED')
    expect(() => requireSupportedAgent('0.15.0')).not.toThrow()
    vi.stubEnv('SIGNING_DESKTOP_RELEASE', JSON.stringify({ ...release, zipSha256: 'bad' }))
    expect((await GET()).status).toBe(503)
    expect(() => requireSupportedAgent('0.15.0')).toThrow()
  })
  it('does not lower an independently configured minimum', () => {
    configure(); vi.stubEnv('SIGNING_MIN_AGENT_VERSION', '0.16.0')
    expect(() => requireSupportedAgent('0.15.0')).toThrow('AGENT_UPDATE_REQUIRED')
  })
  it('keeps credentials on the GitHub API and returns a trusted redirect only', async () => {
    configure(); vi.stubEnv('SIGNING_RELEASE_GITHUB_TOKEN', 'private-secret')
    const fetcher = downloadFetcher(new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/asset?signed=yes' } }))
    const result = await desktopUpdateDownload(fetcher)
    expect(fetcher).toHaveBeenCalledWith('https://api.github.com/repos/example/private-agent/releases/assets/123', expect.objectContaining({ redirect: 'manual', headers: expect.objectContaining({ Authorization: 'Bearer private-secret' }) }))
    expect(result.status).toBe(302)
    expect(result.headers.get('authorization')).toBeNull()
  })
  it.each(['http://release-assets.githubusercontent.com/file', 'https://evil.invalid/file', 'https://release-assets.githubusercontent.com.evil.invalid/file'])('rejects malicious redirects: %s', async location => {
    configure()
    await expect(desktopUpdateDownload(downloadFetcher(new Response(null, { status: 302, headers: { location } })))).rejects.toThrow()
  })
  it('handles direct binary responses without forwarding credentials or cookies', async () => {
    configure()
    const result = await desktopUpdateDownload(downloadFetcher(new Response('zip-bytes', { headers: { 'content-type': 'application/octet-stream', 'set-cookie': 'secret' } })))
    expect(await result.text()).toBe('zip-bytes'); expect(result.headers.get('set-cookie')).toBeNull()
  })
  it('does not forward upstream errors or JSON metadata as installers', async () => {
    configure()
    const result = await desktopUpdateDownload(downloadFetcher(Response.json({ private: 'details' })))
    expect(result.status).toBe(503); expect(await result.text()).toBe('')
  })
})
