// Service Worker Registration Component
// Registers the service worker for PWA functionality
'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    // Development chunks reuse URLs across builds and must never be cached.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations
          .filter(registration => new URL(registration.active?.scriptURL || registration.scope).origin === window.location.origin)
          .map(registration => registration.unregister())))
        .then(() => caches.keys())
        .then(names => Promise.all(names.filter(name => name.startsWith('notifica-ia-static-')).map(name => caches.delete(name))))
        .catch(error => console.error('Development cache cleanup failed:', error))
      return
    }

    void navigator.serviceWorker
      .register('/sw.js')
      .then(registration => {
        if (registration?.scope) {
          console.log('Service Worker registered successfully:', registration.scope)
        }
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error)
      })
  }, [])

  return null
}

