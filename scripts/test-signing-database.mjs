import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)), 'run',
  'tests/integration/signing-database.test.ts', 'tests/integration/signing-service.test.ts',
  'tests/integration/signing-completion.test.ts',
  'tests/integration/signing-devices.test.ts',
  'tests/integration/signing-artifacts.test.ts',
  'tests/integration/signing-center.test.ts',
  'tests/integration/signing-deliveries.test.ts',
  'tests/integration/signing-office-folder.test.ts',
  'tests/integration/signing-operations.test.ts',
], { stdio: 'inherit', env: { ...process.env, SIGNING_DATABASE_TESTS: '1' } })
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
