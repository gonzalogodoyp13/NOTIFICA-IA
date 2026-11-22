import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/diagnostics/monitor', () => ({ reportToMonitor: () => {} }))
import { prisma } from '@/lib/prisma'
import { diagnosticEvent } from '@/lib/diagnostics/core'
import { persistDiagnostic } from '@/lib/diagnostics/server'

describe.skipIf(process.env.TEST_DIAGNOSTICS_DATABASE !== 'true')('diagnostic database integration', () => {
  it('atomically counts concurrent occurrences, indexes references and reopens resolved groups', async () => {
    const operation = `test.${randomUUID()}`
    const events = Array.from({ length: 6 }, (_, i) => diagnosticEvent(undefined, {
      module: 'diagnostics-test', operation, officeId: i % 2 ? 12 : 23, userId: `synthetic-${i}`, requestId: `test-${i}`,
    }, randomUUID()))
    const references = events.map(e => e.reference)
    let incidentId: string | undefined
    try {
      const writes = await Promise.allSettled(events.map(persistDiagnostic))
      expect(writes.filter(w => w.status === 'rejected')).toEqual([])
      const rows = await prisma.diagnosticEvent.findMany({ where: { reference: { in: references } }, include: { incident: true } })
      expect(rows).toHaveLength(6)
      incidentId = rows[0].incidentId
      expect(new Set(rows.map(r => r.incidentId)).size).toBe(1)
      expect(rows[0].incident.occurrences).toBe(6)
      await prisma.diagnosticIncident.update({ where: { id: incidentId }, data: { status: 'RESOLVED', resolvedAt: new Date() } })
      const recurring = { ...events[0], reference: randomUUID() }; references.push(recurring.reference)
      await persistDiagnostic(recurring)
      expect(await prisma.diagnosticIncident.findUnique({ where: { id: incidentId } })).toMatchObject({ status: 'OPEN', occurrences: 7, resolvedAt: null })
      expect(await prisma.platformAudit.count({ where: { targetId: incidentId, action: 'incident.reopened' } })).toBe(1)
      const current = await prisma.diagnosticIncident.findUniqueOrThrow({ where: { id: incidentId } })
      expect(current.revision).toBe(6)
      expect((await prisma.diagnosticIncident.updateMany({ where: { id: incidentId, revision: 5 }, data: { status: 'RESOLVED' } })).count).toBe(0)
      const policies = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('diagnostic_events', 'diagnostic_incidents')`
      expect(policies.every(p => p.relrowsecurity)).toBe(true)
    } finally {
      // Delete only this test's random references and its now-empty synthetic group.
      await prisma.diagnosticEvent.deleteMany({ where: { reference: { in: references } } })
      if (incidentId) {
        await prisma.platformAudit.deleteMany({ where: { targetId: incidentId } })
        await prisma.diagnosticIncident.deleteMany({ where: { id: incidentId, events: { none: {} } } })
      }
      await prisma.$disconnect()
    }
  }, 30000)
})
