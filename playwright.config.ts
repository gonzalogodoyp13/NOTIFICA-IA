import { defineConfig, devices } from '@playwright/test'

const providedBaseUrl = process.env.NEXT_PUBLIC_BASE_URL
const localBaseUrl = 'http://127.0.0.1:3002'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: providedBaseUrl ?? localBaseUrl,
    trace: 'retain-on-failure',
  },
  webServer: providedBaseUrl
    ? undefined
    : {
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3002',
        url: localBaseUrl,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

