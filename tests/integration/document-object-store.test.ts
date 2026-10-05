import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createArchiveHttpStore, documentObjectStore, supabaseDocumentStore } from '../../lib/documents/objectStore'

describe('document storage provider boundary', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('keeps existing Supabase objects as the default and fails closed on unknown providers', () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'supabase')
    expect(documentObjectStore()).toBe(supabaseDocumentStore)
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'typo')
    expect(() => documentObjectStore()).toThrow('DOCUMENT_STORAGE_PROVIDER_INVALID')
  })
  it('uses the same logical identities on a private archive, immutable writes and server-only credentials', async () => {
    const bytes = Buffer.from('%PDF-archive-test')
    const request = vi.fn<typeof fetch>(async (_url, options) => new Response(options?.method === 'GET' ? bytes : null))
    const store = createArchiveHttpStore('https://archive.example/', 's'.repeat(32), request)
    expect(await store.download('documents', 'offices/7/signed file.pdf')).toEqual(bytes)
    expect(String(request.mock.calls[0][0])).toBe('https://archive.example/v1/objects/documents/offices/7/signed%20file.pdf')
    await store.upload('documents', 'offices/7/file.pdf', bytes)
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'PUT', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${'s'.repeat(32)}`, 'If-None-Match': '*' } })
    request.mockResolvedValue(new Response(null, { status: 404 }))
    await expect(store.remove('documents', 'missing.pdf')).resolves.toBeUndefined()
    await expect(store.download('documents', 'missing.pdf')).rejects.toThrow('STORAGE')
  })
  it('rejects unsafe endpoints, traversal, public buckets and excessive responses', async () => {
    for (const origin of ['http://archive.example/', 'https://user:pass@archive.example/', 'https://archive.example/path', 'https://archive.example/?key=x'])
      expect(() => createArchiveHttpStore(origin, 's'.repeat(32))).toThrow()
    const request = vi.fn<typeof fetch>(async () => Response.json({ private: false }))
    const store = createArchiveHttpStore('https://archive.example/', 's'.repeat(32), request)
    await expect(store.download('documents', '../secret')).rejects.toThrow('INVALID_OBJECT_KEY')
    expect(request).not.toHaveBeenCalled()
    await expect(store.assertPrivate('documents')).rejects.toThrow('PRIVATE_STORAGE_REQUIRED')
    request.mockResolvedValueOnce(Response.json({ private: true }))
    await store.assertPrivate('documents')
    request.mockResolvedValueOnce(new Response('x', { headers: { 'Content-Length': String(33 * 1024 * 1024) } }))
    await expect(store.download('documents', 'file.pdf')).rejects.toThrow('STORAGE')
  })
})
