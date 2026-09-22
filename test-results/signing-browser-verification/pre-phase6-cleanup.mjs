import nextEnv from '@next/env'
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

nextEnv.loadEnvConfig(process.cwd())
const db = new PrismaClient()
try {
  const schemas = await db.$queryRaw`SELECT COUNT(*)::int AS count FROM pg_namespace WHERE nspname LIKE 'signing_test_%'`
  const testOffices = await db.office.count({ where: { nombre: { startsWith: 'Signing verification ' } } })
  const output = {
    checkedAt: new Date().toISOString(),
    temporarySigningSchemas: schemas[0].count,
    syntheticSigningOffices: testOffices,
    productionDevices: await db.signingDevice.count(),
    automaticEnqueueEnabled: process.env.SIGNING_AUTO_ENQUEUE_ENABLED === 'true',
    proxyTrustEnabled: process.env.SIGNING_TRUST_PROXY === 'true',
  }
  writeFileSync('test-results/signing-browser-verification/pre-phase6-cleanup-results.json', JSON.stringify(output, null, 2) + '\n')
  console.log(JSON.stringify(output, null, 2))
  assert.equal(output.temporarySigningSchemas, 0)
  assert.equal(output.syntheticSigningOffices, 0)
  assert.equal(output.automaticEnqueueEnabled, false)
} finally {
  await db.$disconnect()
}
