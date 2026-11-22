import type { NextRequest } from 'next/server'

export class RequestSecurityError extends Error {
  constructor(public code: string, public status: number, public retryAfter?: number) { super(code) }
}

export function requireSameOrigin(request: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  const configured = process.env.APP_ORIGIN || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
    || (process.env.NODE_ENV === 'production' ? process.env.SIGNING_BROWSER_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') : '')
  let expected: string
  try {
    if (!configured && process.env.NODE_ENV === 'production') throw new Error()
    const url = new URL(configured || request.nextUrl.origin)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new Error()
    expected = url.origin
  } catch { throw new RequestSecurityError('ORIGIN_NOT_CONFIGURED', 503) }
  if (request.headers.get('origin') !== expected || request.headers.get('sec-fetch-site') === 'cross-site')
    throw new RequestSecurityError('FORBIDDEN', 403)
}

export async function boundRequestBody(request: NextRequest, maximumBytes?: number) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || !request.body) return
  const multipart = request.nextUrl.pathname === '/api/ajustes/pdf' && request.method === 'PUT'
  const maximum = maximumBytes ?? (multipart ? 16 * 1024 * 1024 : 1024 * 1024)
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json' && !(multipart && contentType === 'multipart/form-data'))
    throw new RequestSecurityError('UNSUPPORTED_MEDIA_TYPE', 415)
  if (Number(request.headers.get('content-length')) > maximum) throw new RequestSecurityError('REQUEST_TOO_LARGE', 413)
  const reader = request.body.getReader()
  let expired = false, size = 0
  const chunks: Uint8Array[] = []
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}) }, 15_000)
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (expired) throw new RequestSecurityError('REQUEST_TIMEOUT', 408)
      if (done) break
      size += value.length
      if (size > maximum) { await reader.cancel(); throw new RequestSecurityError('REQUEST_TOO_LARGE', 413) }
      chunks.push(value)
    }
  } finally { clearTimeout(timer); reader.releaseLock() }
  const bytes = Buffer.concat(chunks)
  const bounded = new Request(request.url, { method: request.method, headers: request.headers, body: new Uint8Array(bytes) })
  // Existing handlers close over the original NextRequest. Replace only its
  // body readers, after enforcing a streamed bound; never trust Content-Length.
  for (const method of ['json', 'text', 'arrayBuffer', 'formData', 'blob'] as const)
    Object.defineProperty(request, method, { value: bounded[method].bind(bounded), configurable: true })
}
