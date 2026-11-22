import { describe, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ actor: `operations-query-verification-${Date.now()}` }))
// This tests database queries only. Real authorization is tested separately;
// no grant is created and no real account is promoted.
vi.mock('@/lib/operations/auth', () => ({ requirePlatformOwner: async () => ({ id: state.actor }), OperationsAccessError: class extends Error { constructor(public status: number, code: string) { super(code) } } }))
import { prisma } from '@/lib/prisma'
import { loadOperations } from '@/lib/operations/queries'

describe.skipIf(process.env.TEST_OPERATIONS_DATABASE !== 'true')('operations database queries', () => {
  it('loads bounded real-data views and retains private database access controls', async () => {
    try {
      for (const section of ['resumen', 'incidentes', 'oficinas', 'usuarios', 'tokens', 'trabajos', 'reportes', 'recibos', 'correos', 'salud', 'guias', 'alertas', 'recuperacion']) {
        const result = await loadOperations([section], {})
        expect(result.title).toBeTruthy()
        expect(result.tables.every(table => table.rows.length <= 25)).toBe(true)
        expect(() => JSON.stringify(result)).not.toThrow()
      }
      const office = await prisma.office.findFirst({ select: { id: true } })
      const user = await prisma.user.findFirst({ select: { id: true } })
      const device = await prisma.signingDevice.findFirst({ select: { id: true } })
      const incident = await prisma.diagnosticIncident.findFirst({ select: { id: true } })
      for (const [section, id] of [['oficinas', office?.id], ['usuarios', user?.id], ['tokens', device?.id], ['incidentes', incident?.id]] as const) {
        if (id) expect((await loadOperations([section, String(id)], {})).title).toBeTruthy()
      }
      const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('platform_grants', 'platform_audit', 'diagnostic_events', 'diagnostic_incidents', 'operations_pulses', 'operations_observations', 'operations_policies', 'operations_maintenance', 'operations_alerts', 'operations_notifications')`
      expect(rows).toHaveLength(10); expect(rows.every(r => r.relrowsecurity)).toBe(true)
      for (const role of ['anon', 'authenticated']) {
        const [permissions] = await prisma.$queryRaw<Array<{ grants: boolean; audit: boolean; incidents: boolean }>>`SELECT has_table_privilege(${role}, 'platform_grants', 'SELECT') AS grants, has_table_privilege(${role}, 'platform_audit', 'SELECT') AS audit, has_table_privilege(${role}, 'diagnostic_incidents', 'UPDATE') AS incidents`
        expect(permissions).toEqual({ grants: false, audit: false, incidents: false })
        const [health] = await prisma.$queryRaw<Array<{ pulses: boolean; observations: boolean }>>`SELECT has_table_privilege(${role}, 'operations_pulses', 'SELECT') AS pulses, has_table_privilege(${role}, 'operations_observations', 'INSERT') AS observations`
        expect(health).toEqual({ pulses: false, observations: false })
        for (const table of ['operations_policies', 'operations_maintenance', 'operations_alerts', 'operations_notifications', 'operations_recoveries']) {
          const [access] = await prisma.$queryRaw<Array<{read: boolean; write: boolean}>>`SELECT has_table_privilege(${role}, ${table}, 'SELECT') AS read, has_table_privilege(${role}, ${table}, 'INSERT') AS write`
          expect(access).toEqual({read:false,write:false})
        }
      }
    } finally {
      await prisma.platformAudit.deleteMany({ where: { actorUserId: state.actor, action: 'operations.view' } })
      await prisma.$disconnect()
    }
  }, 120000)
})
