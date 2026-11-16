import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: (...args: any[]) => (holder.db!.$queryRaw as any)(...args) } }))
import { enforceRequestQuota } from '@/lib/security/rateLimit'

describe.skipIf(process.env.SECURITY_DATABASE_TESTS !== '1')('persistent request quotas', () => {
  let admin: PrismaClient
  const schema = `security_test_${randomUUID().replaceAll('-', '')}`
  beforeAll(async () => {
    loadEnvConfig(process.cwd())
    const url = new URL(process.env.DIRECT_URL ?? process.env.DATABASE_URL!)
    admin = new PrismaClient({ datasourceUrl: url.toString() })
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    await admin.$executeRawUnsafe(`CREATE TABLE "${schema}".device_rate_limits (LIKE public.device_rate_limits INCLUDING ALL)`)
    url.searchParams.set('schema', schema)
    holder.db = new PrismaClient({ datasourceUrl: url.toString() })
  }, 60_000)
  afterAll(async () => {
    await holder.db?.$disconnect()
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await admin.$disconnect()
    }
  }, 30_000)
  it('allows only five concurrent test-email requests and keeps denied attempts counted', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () =>
      enforceRequestQuota('/api/recibos/send/test', 'POST', { id: 'test-user', officeId: 123 })))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(5)
    for (const result of results.filter(r => r.status === 'rejected'))
      expect((result as PromiseRejectedResult).reason).toMatchObject({ status: 429 })
    const rows = await holder.db!.$queryRaw<Array<{ count: number }>>`SELECT count FROM device_rate_limits`
    expect(rows.map(row => row.count)).toEqual([8, 8])
  }, 30_000)
  it('shares office quotas across users while isolating different offices', async () => {
    for (let i = 0; i < 25; i++) await enforceRequestQuota('/api/recibos/send/test', 'POST', { id: `office-user-${i}`, officeId: 456 })
    await expect(enforceRequestQuota('/api/recibos/send/test', 'POST', { id: 'office-user-extra', officeId: 456 })).rejects.toMatchObject({ status: 429 })
    await expect(enforceRequestQuota('/api/recibos/send/test', 'POST', { id: 'separate-user', officeId: 789 })).resolves.toBeUndefined()
  }, 30_000)
})
