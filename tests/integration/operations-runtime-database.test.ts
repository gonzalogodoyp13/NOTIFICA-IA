import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { expect, it } from 'vitest'

it.skipIf(process.env.TEST_OPERATIONS_DATABASE !== 'true')('restricted runtime can use operations tables while browser roles remain denied', async () => {
  const db = new PrismaClient(), id = `rollout-verification-${randomUUID()}`
  const rollback = new Error('ROLLBACK_VERIFICATION')
  const tables = ['diagnostic_incidents', 'diagnostic_events', 'platform_grants', 'platform_audit', 'owner_email_sessions', 'operations_pulses', 'operations_observations', 'operations_policies', 'operations_maintenance', 'operations_alerts', 'operations_notifications', 'operations_recoveries']
  try {
    await expect(db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE notifica_runtime')
      for (const table of tables) {
        // Names come exclusively from the fixed test allowlist.
        await tx.$queryRawUnsafe(`SELECT 1 FROM public.${table} LIMIT 1`)
        const rows = await tx.$queryRaw<Array<{ role: string; read: boolean; write: boolean }>>`SELECT role, has_table_privilege(role, ${table}, 'SELECT') AS read, has_table_privilege(role, ${table}, 'INSERT') AS write FROM (VALUES ('anon'),('authenticated')) AS roles(role)`
        expect(rows.every(row => !row.read && !row.write)).toBe(true)
      }
      const grant = await tx.platformGrant.findFirst({ where: { role: 'OWNER', revokedAt: null }, select: { userId: true } })
      expect(grant).not.toBeNull()
      await tx.platformAudit.create({ data: { id, action: 'verification.rollback', targetId: id, details: { synthetic: true } } })
      throw rollback
    }, { timeout: 30000 })).rejects.toThrow('ROLLBACK_VERIFICATION')
    expect(await db.platformAudit.findUnique({ where: { id } })).toBeNull()
  } finally { await db.$disconnect() }
}, 45000)
