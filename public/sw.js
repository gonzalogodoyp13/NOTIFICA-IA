// Service Worker for NOTIFICA IA
// Minimal PWA implementation with basic caching strategies

const CACHE_VERSION = 'v1.0.1'
const CACHE_NAME = `notifica-ia-cache-${CACHE_VERSION}`
const urlsToCache = [
  '/',
  '/login',
  '/dashboard',
  '/manifest.json',
]

// Install event: cache essential resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch((err) => {
        console.warn('Service Worker: Some resources failed to cache', err)
      })
    })
  )
  // Skip waiting to activate immediately
  self.skipWaiting()
})

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  // Take control of all pages immediately
  return self.clients.claim()
})

// Fetch event: implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip caching for non-GET requests (POST, PUT, DELETE)
  if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
    return
  }

  // Network-first strategy for API routes
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses (only GET requests)
          if (response.ok && request.method === 'GET') {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              try {
                cache.put(request, responseClone).catch((err) => {
                  console.warn('Service Worker: Failed to cache API response', err)
                })
              } catch (err) {
                console.warn('Service Worker: Error caching API response', err)
              }
            })
          }
          return response
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request)
        })
    )
    return
  }

  // Cache-first strategy for static assets and pages
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request).then((response) => {
        // Don't cache non-GET requests or non-successful responses
        if (request.method !== 'GET' || !response.ok) {
          return response
        }

        // Cache the response with error handling
        const responseClone = response.clone()
        caches.open(CACHE_NAME).then((cache) => {
          try {
            cache.put(request, responseClone).catch((err) => {
              console.warn('Service Worker: Failed to cache response', err)
            })
          } catch (err) {
            console.warn('Service Worker: Error caching response', err)
          }
        })

        return response
      })
    })
  )
})

