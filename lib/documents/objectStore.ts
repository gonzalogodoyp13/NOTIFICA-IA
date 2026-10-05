import 'server-only'
import { createServerSupabaseStorageClient } from '../supabaseServer'

/** Logical bucket/key identities are permanent. Only this adapter knows the host.
 * Both the application and Windows folder retrieve bytes through this boundary. */
export interface DocumentObjectStore {
  assertPrivate(bucket: string): Promise<void>
  download(bucket: string, key: string): Promise<Buffer>
  upload(bucket: string, key: string, bytes: Buffer): Promise<void>
  remove(bucket: string, key: string): Promise<void>
}

const MAX_OBJECT_BYTES = 32 * 1024 * 1024
const cloud = () => createServerSupabaseStorageClient({ requireServiceRole: true, timeoutMs: 60_000 }).storage
export const supabaseDocumentStore: DocumentObjectStore = {
  async assertPrivate(bucket) {
    const { data, error } = await cloud().getBucket(bucket)
    if (error || !data || data.public) throw new Error('PRIVATE_STORAGE_REQUIRED')
  },
  async download(bucket, key) {
    const { data, error } = await cloud().from(bucket).download(key)
    if (error || !data || data.size > MAX_OBJECT_BYTES) throw new Error('STORAGE')
    return Buffer.from(await data.arrayBuffer())
  },
  async upload(bucket, key, bytes) {
    const { error } = await cloud().from(bucket).upload(key, bytes, { contentType: 'application/pdf', upsert: false })
    if (error) throw new Error('STORAGE')
  },
  async remove(bucket, key) {
    const { error } = await cloud().from(bucket).remove([key])
    if (error) throw new Error('STORAGE')
  },
}

/** Private archive-server protocol. No browser/device receives this credential.
 * A migration copies and verifies logical keys before changing the provider. */
export function createArchiveHttpStore(origin: string, token: string, request = fetch): DocumentObjectStore {
  const base = new URL(origin)
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.username || base.password || base.search || base.hash || token.length < 32)
    throw new Error('ARCHIVE_CONFIGURATION_INVALID')
  function segment(value: string) {
    if (!value || value === '.' || value === '..' || /[\\/\x00-\x1f]/.test(value)) throw new Error('INVALID_OBJECT_KEY')
    return encodeURIComponent(value)
  }
  const objectPath = (bucket: string, key: string) => `v1/objects/${segment(bucket)}/${key.split('/').map(segment).join('/')}`
  async function call(path: string, method: string, bytes?: Buffer) {
    const response = await request(new URL(path, base), { method, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(60_000), headers: { Authorization: `Bearer ${token}`,
        ...(bytes ? { 'Content-Type': 'application/pdf', 'If-None-Match': '*' } : {}) },
      ...(bytes ? { body: new Uint8Array(bytes) } : {}) })
    if (!response.ok && !(method === 'DELETE' && response.status === 404)) throw new Error('STORAGE')
    return response
  }
  async function read(response: Response, limit: number) {
    if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('STORAGE') }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('STORAGE')
    const chunks: Uint8Array[] = []; let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length
        if (size > limit) { await reader.cancel(); throw new Error('STORAGE') }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    return Buffer.concat(chunks)
  }
  return {
    async assertPrivate(bucket) {
      const metadata = JSON.parse((await read(await call(`v1/buckets/${segment(bucket)}`, 'GET'), 4096)).toString('utf8'))
      if (metadata.private !== true) throw new Error('PRIVATE_STORAGE_REQUIRED')
    },
    async download(bucket, key) { return read(await call(objectPath(bucket, key), 'GET'), MAX_OBJECT_BYTES) },
    async upload(bucket, key, bytes) {
      if (bytes.length > MAX_OBJECT_BYTES) throw new Error('STORAGE')
      await call(objectPath(bucket, key), 'PUT', bytes)
    },
    async remove(bucket, key) { await call(objectPath(bucket, key), 'DELETE') },
  }
}

export function documentObjectStore(): DocumentObjectStore {
  const provider = process.env.DOCUMENT_STORAGE_PROVIDER ?? 'supabase'
  if (provider === 'supabase') return supabaseDocumentStore
  if (provider === 'archive-http') return createArchiveHttpStore(process.env.DOCUMENT_ARCHIVE_ORIGIN ?? '', process.env.DOCUMENT_ARCHIVE_TOKEN ?? '')
  throw new Error('DOCUMENT_STORAGE_PROVIDER_INVALID')
}

// Resolve configuration per operation; callers never import a provider directly.
export const documentStorage: DocumentObjectStore = {
  assertPrivate: bucket => documentObjectStore().assertPrivate(bucket),
  download: (bucket, key) => documentObjectStore().download(bucket, key),
  upload: (bucket, key, bytes) => documentObjectStore().upload(bucket, key, bytes),
  remove: (bucket, key) => documentObjectStore().remove(bucket, key),
}
