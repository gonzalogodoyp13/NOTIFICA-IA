import 'server-only'
import { z } from 'zod'

const releaseSchema = z.object({
  version: z.string().regex(/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/),
  zipSha256: z.string().regex(/^[a-f0-9]{64}$/),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  tag: z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
}).strict()

// Operator-pinned release, never an unreviewed GitHub "latest" response.
export function publishedDesktopUpdate() {
  const raw = process.env.SIGNING_DESKTOP_RELEASE
  return raw ? releaseSchema.parse(JSON.parse(raw)) : null
}

export function publicDesktopUpdate() {
  const release = publishedDesktopUpdate()
  if (!release) return null
  const { version, zipSha256, manifestSha256 } = release
  return { version, zipSha256, manifestSha256 }
}

export async function desktopUpdateDownload(fetcher: typeof fetch = fetch) {
  const release = publishedDesktopUpdate()
  if (!release) return new Response(null, { status: 404 })
  const token = process.env.SIGNING_RELEASE_GITHUB_TOKEN
  const headers = { 'User-Agent': 'Notifica-Desktop-Updates', 'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  const metadata = await fetcher(`https://api.github.com/repos/${release.repository}/releases/tags/${encodeURIComponent(release.tag)}`, {
    headers: { ...headers, Accept: 'application/vnd.github+json' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000),
  })
  if (!metadata.ok) { await metadata.body?.cancel(); return new Response(null, { status: 503 }) }
  const tagged = z.object({ draft: z.literal(false), assets: z.array(z.object({
    id: z.number().int().positive().safe(), name: z.string(), state: z.literal('uploaded'),
    digest: z.string().nullable().optional(),
  })).max(100) }).parse(await metadata.json())
  const matches = tagged.assets.filter(asset => asset.name === `NOTIFICA-Windows-${release.version}-managed.zip`)
  if (matches.length !== 1 || (matches[0].digest && matches[0].digest !== `sha256:${release.zipSha256}`)) throw new Error('RELEASE_ASSET_MISMATCH')
  const upstream = await fetcher(`https://api.github.com/repos/${release.repository}/releases/assets/${matches[0].id}`, {
    headers: { ...headers, Accept: 'application/octet-stream' },
    redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20_000),
  })
  if (upstream.status === 302) {
    const location = new URL(upstream.headers.get('location') ?? '')
    if (location.protocol !== 'https:' || location.hostname !== 'release-assets.githubusercontent.com' ||
        location.username || location.password || location.port) throw new Error('UNTRUSTED_ASSET_LOCATION')
    return new Response(null, { status: 302, headers: { Location: location.href, 'Cache-Control': 'no-store' } })
  }
  // GitHub may stream the asset instead of redirecting. Forward only the bytes,
  // never upstream headers, credentials, repository metadata or error bodies.
  if (upstream.status === 200 && upstream.body &&
      /^(application\/octet-stream|application\/zip)(;|$)/i.test(upstream.headers.get('content-type') ?? '')) {
    return new Response(upstream.body, { headers: { 'Content-Type': 'application/zip', 'Cache-Control': 'no-store' } })
  }
  await upstream.body?.cancel()
  return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}
