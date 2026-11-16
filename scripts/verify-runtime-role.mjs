import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
require('@next/env').loadEnvConfig(process.cwd())
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL })
const rollback = new Error('ROLL_BACK_VERIFICATION')
const result = { backendRead: false, backendWrite: false, denied: [] }
try {
  const [role] = await db.$queryRaw`SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname='notifica_runtime'`
  assert.ok(role)
  assert.ok(Object.values(role).every(value => value === false))
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE notifica_runtime')
      const [identity] = await tx.$queryRaw`SELECT current_user AS name`
      assert.equal(identity.name, 'notifica_runtime')
      // Exercise permissions without returning customer records.
      await tx.$queryRaw`SELECT id FROM public.users WHERE false`
      await tx.$queryRaw`SELECT id FROM public."Documento" WHERE false`
      result.backendRead = true
      const key = `role-verification-${randomUUID()}`
      await tx.$executeRaw`INSERT INTO public.device_rate_limits (key, "windowAt", count) VALUES (${key}, now(), 1)`
      const changed = await tx.$executeRaw`UPDATE public.device_rate_limits SET count=2 WHERE key=${key}`
      assert.equal(changed, 1)
      assert.equal(await tx.$executeRaw`DELETE FROM public.device_rate_limits WHERE key=${key}`, 1)
      result.backendWrite = true
      throw rollback
    }, { timeout: 20_000 })
  } catch (error) { if (error !== rollback) throw error }
  for (const [name, sql] of [
    ['migration history', 'SELECT * FROM public._prisma_migrations LIMIT 0'],
    ['authentication records', 'SELECT * FROM auth.users LIMIT 0'],
    ['schema creation', 'CREATE TABLE public.runtime_role_verification_probe (id integer)'],
    ['table alteration', 'ALTER TABLE public.device_rate_limits ADD COLUMN runtime_role_verification_probe integer'],
  ]) {
    let denied = false
    try {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE notifica_runtime')
        await tx.$executeRawUnsafe(sql)
        throw rollback // If unexpectedly permitted, still leave no changes.
      })
    } catch (error) {
      if (error?.meta?.code === '42501') denied = true
      else if (error !== rollback) throw error
    }
    assert.ok(denied, `Role unexpectedly permits ${name}`)
    result.denied.push(name)
  }
  console.log(JSON.stringify({ passed: true, ...result, loginEnabled: false, credentialsChanged: false }, null, 2))
} finally { await db.$disconnect() }
