import { defineConfig, devices } from '@playwright/test'

// Component interaction regressions run in a browser with mocked transport.
// No application server, login, or live user records are required.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'user-action-regressions.spec.ts',
  workers: 1,
  timeout: 30_000,
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
})
