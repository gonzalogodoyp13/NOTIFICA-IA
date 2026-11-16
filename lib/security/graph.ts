export function trustedGraphUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'graph.microsoft.com' || url.port ||
      url.username || url.password || url.hash || !url.pathname.startsWith('/v1.0/'))
    throw new Error('UNTRUSTED_GRAPH_URL')
  return url.href
}

export async function graphFetch(url: string, init: RequestInit = {}, transport: typeof fetch = fetch) {
  return transport(trustedGraphUrl(url), { ...init, redirect: 'error', cache: 'no-store',
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) })
}
