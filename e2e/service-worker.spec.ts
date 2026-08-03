import { expect, test } from '@playwright/test'

import { AUTH_STATE_PATH, authStateExists } from '../scripts/qa-support'

test.use({ storageState: AUTH_STATE_PATH, serviceWorkers: 'allow' })

test('service worker caches only public static assets and never serves legal data offline', async ({ page, context }) => {
  expect(authStateExists(), 'Run npm run qa:auth before the service-worker check.').toBe(true)
  await page.goto('/dashboard')
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map(registration => registration.unregister()))
    const old = await caches.open('notifica-ia-cache-v1.0.1')
    await old.put('/dashboard', new Response('old protected data'))
  })
  await page.reload()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('notifica-ia-cache-v1.0.1'))).toBe(false)

  const apiStatus = await page.evaluate(async () => (await fetch('/api/user/me')).status)
  expect(apiStatus).toBe(200)
  const cacheState = await page.evaluate(async () => {
    const names = await caches.keys()
    const urls: string[] = []
    for (const name of names) {
      const cache = await caches.open(name)
      urls.push(...(await cache.keys()).map(request => new URL(request.url).pathname))
    }
    return { names, urls }
  })
  expect(cacheState.urls.some(url => url.startsWith('/api/'))).toBe(false)
  expect(cacheState.urls.some(url => url === '/dashboard' || url.startsWith('/roles/'))).toBe(false)
  expect(cacheState.urls).toEqual(expect.arrayContaining(['/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png']))

  await context.setOffline(true)
  try {
    const offline = await page.evaluate(async () => {
      const request = async (url: string) => {
        try { return { ok: true, status: (await fetch(url)).status } } catch { return { ok: false, status: null } }
      }
      return {
        api: await request('/api/user/me'),
        protectedPage: await request('/dashboard'),
        manifest: await request('/manifest.json'),
      }
    })
    expect(offline.api.ok).toBe(false)
    expect(offline.protectedPage.ok).toBe(false)
    expect(offline.manifest).toMatchObject({ ok: true, status: 200 })
  } finally {
    await context.setOffline(false)
  }
})
