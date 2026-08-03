import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('service worker data safety', () => {
  const source = fs.readFileSync(path.resolve('public/sw.js'), 'utf8')

  it('uses the v1.1.0 static-only cache policy', () => {
    expect(source).toContain("CACHE_VERSION = 'v1.1.0'")
    expect(source).toContain("url.pathname.startsWith('/_next/static/')")
    expect(source).not.toContain("'/dashboard'")
    expect(source).not.toContain("cache.put(request, responseClone)")
  })

  it('routes every non-whitelisted request directly to the network', () => {
    expect(source).toMatch(/if \(!isPublicStaticAsset\(request, url\)\)[\s\S]*event\.respondWith\(fetch\(request\)\)/)
  })
})
