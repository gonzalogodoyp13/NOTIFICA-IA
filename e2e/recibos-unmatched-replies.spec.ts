import { readFileSync } from 'node:fs'
import { expect, request as playwrightRequest, test } from '@playwright/test'

import { AUTH_STATE_PATH, authStateExists } from '../scripts/qa-support'

test.describe('Recibos unmatched replies', () => {
  test('legacy audit routes are removed without affecting the unmatched queue', async ({ browser, baseURL }) => {
    if (!authStateExists()) {
      throw new Error('Missing .auth/supabase-user.json. Run npm run qa:auth before this suite.')
    }
    readFileSync(AUTH_STATE_PATH)

    const context = await browser.newContext({ storageState: AUTH_STATE_PATH })
    const page = await context.newPage()
    const legacyPage = await page.goto('/ajustes/logs')
    expect(legacyPage?.status()).toBe(404)
    await expect(page).not.toHaveURL(/\/recibos/)

    const api = await playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH })
    for (const route of ['/api/log', '/api/logs', '/api/logs/summary', '/api/logs/export', '/api/logs/recent']) {
      const response = await api.get(route)
      expect(response.status(), `${route}: ${await response.text()}`).toBe(404)
    }
    await api.dispose()

    await page.goto('/ajustes')
    await expect(page.getByText('Registros de Auditoría', { exact: true })).toHaveCount(0)

    await page.goto('/recibos?panel=unmatched-replies')
    await expect(page.getByRole('dialog', { name: 'Centro de respuestas y envíos' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Respuestas por asociar/ })).toHaveAttribute('aria-selected', 'true')

    await context.close()
  })

  test('queue API validates pagination and returns the new contract', async ({ baseURL }) => {
    if (!authStateExists()) {
      throw new Error('Missing .auth/supabase-user.json. Run npm run qa:auth before this suite.')
    }
    const api = await playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH })
    const response = await api.get('/api/recibos/send/replies/unmatched?page=1&limit=25&status=all')
    expect(response.status(), await response.text()).toBe(200)
    const payload = await response.json() as { ok: boolean; data: { items: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } } }
    expect(payload.ok).toBe(true)
    expect(Array.isArray(payload.data.items)).toBe(true)
    expect(payload.data.pagination).toMatchObject({ page: 1, limit: 25 })

    const invalid = await api.get('/api/recibos/send/replies/unmatched?page=0&status=matched')
    expect(invalid.status()).toBe(400)
    await api.dispose()
  })

  test('closing the modal preserves receipt filters and removes only panel state', async ({ browser }) => {
    if (!authStateExists()) {
      throw new Error('Missing .auth/supabase-user.json. Run npm run qa:auth before this suite.')
    }
    const context = await browser.newContext({ storageState: AUTH_STATE_PATH })
    const page = await context.newPage()
    await page.goto('/recibos?estado=PAGADO&page=2&panel=unmatched-replies')
    await page.getByRole('button', { name: 'Cerrar gestión de envíos' }).click()
    await expect(page).toHaveURL(/estado=PAGADO/)
    await expect(page).toHaveURL(/page=2/)
    await expect(page).not.toHaveURL(/panel=/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await context.close()
  })
})
