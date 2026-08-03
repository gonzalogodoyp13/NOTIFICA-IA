// NOTIFICA IA service worker: public static assets only.
const CACHE_VERSION = 'v1.1.0'
const CACHE_NAME = `notifica-ia-static-${CACHE_VERSION}`
const PRECACHE_URLS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  )
})

function isPublicStaticAsset(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false
  return PRECACHE_URLS.includes(url.pathname) || url.pathname.startsWith('/_next/static/')
}

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // APIs, navigations, RSC payloads, and every non-whitelisted request are network-only.
  if (!isPublicStaticAsset(request, url)) {
    event.respondWith(fetch(request))
    return
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone()
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)))
      }
      return response
    }))
  )
})
