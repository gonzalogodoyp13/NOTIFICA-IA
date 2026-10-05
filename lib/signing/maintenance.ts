import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '../prisma'
import { createSigningService } from './service'
import { createArtifactService, type ArtifactDependencies } from './artifacts'
import { recordCriticalEvent } from '../audit/activityEvent'

export function maintenanceAuthorized(expected: string | undefined, authorization: string | null) {
  if (!expected || expected.length < 32 || !authorization) return false
  const actual = Buffer.from(authorization), target = Buffer.from(`Bearer ${expected}`)
  return actual.length === target.length && timingSafeEqual(actual, target)
}
export async function maintainSigning(db: PrismaClient = prisma, dependencies: ArtifactDependencies = {}) {
  // Oldest serviced offices first: a failed office cannot starve the rest.
  const offices = await db.$queryRaw<Array<{ officeId: number }>>`
    SELECT o."officeId" FROM
      (SELECT "officeId" FROM signing_devices UNION SELECT "officeId" FROM signing_jobs) o
    LEFT JOIN activity_events e ON e."officeId" = o."officeId" AND e."eventType" = 'signing.maintenance_completed'
    GROUP BY o."officeId" ORDER BY max(e."occurredAt") ASC NULLS FIRST, o."officeId" LIMIT 100`
  const queue = createSigningService(db)
  const artifacts = createArtifactService(db, async () => { throw new Error('INTERNAL_MAINTENANCE_ONLY') }, dependencies)
  let recovered = 0, cleaned = 0, failures = 0
  const deadline = Date.now() + 240_000
  for (const office of offices) {
    if (Date.now() >= deadline) { failures++; break }
    try {
      const r = await queue.maintainOffice(office.officeId)
      const c = await artifacts.cleanup(office.officeId)
      // This success marker is durable and the dashboard detects its absence/staleness.
      await recordCriticalEvent(db, { officeId: office.officeId, actorType: 'SYSTEM', source: 'INTERNAL' }, {
        eventType: 'signing.maintenance_completed', module: 'documents', recordType: 'Office', recordId: String(office.officeId), metadata: { recovered: r, cleaned: c } })
      recovered += r; cleaned += c
    } catch { failures++ }
  }
  // Short-lived authentication artifacts only. Signing evidence and canonical audit
  // are never purged by technical retention, including failed attempts.
  const cutoff = new Date(Date.now() - 86400_000)
  await db.deviceSession.deleteMany({ where: { expiresAt: { lt: cutoff } } })
  await db.deviceChallenge.deleteMany({ where: { expiresAt: { lt: cutoff } } })
  return { offices: offices.length, recovered, cleaned, failures }
}
