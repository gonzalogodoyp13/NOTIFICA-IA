import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

import { AUTH_STATE_PATH } from '../scripts/qa-support'

test('capture Supabase auth state', async ({ page }) => {
  mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true })

  console.log('\nLog in with the Supabase test account in the opened browser.')
  console.log('After the app redirects away from /login, this setup saves .auth/supabase-user.json.\n')

  await page.goto('/login')

  await expect
    .poll(
      async () => {
        const response = await page.request.get('/api/user/me')
        return response.status()
      },
      {
        timeout: 600_000,
        intervals: [2_000],
        message: 'Waiting for /api/user/me to accept the logged-in Supabase session.',
      }
    )
    .not.toBe(401)

  await page.context().storageState({ path: AUTH_STATE_PATH })
})
