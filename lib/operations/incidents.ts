import 'server-only'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requirePlatformOwner, OperationsAccessError } from './auth'
import { incidentStatuses } from './policy'

const internalText = z.string().trim().max(2000).refine(v => !/-----BEGIN|(?:password|token|secret|cookie|authorization|pin|contraseña)\s*[:=]\s*\S+/i.test(v), 'No incluyas credenciales ni PINs.')
export const incidentEditSchema = z.object({
  revision: z.number().int().nonnegative(), status: z.enum(incidentStatuses), severity: z.enum(['warning', 'error', 'critical']),
  assignedToUserId: z.string().max(160).nullable(), note: internalText.min(3),
  impact: internalText, suspectedCause: internalText, confirmedCause: internalText, nextSteps: internalText,
}).strict()
export async function updateIncident(id: string, input: unknown) {
  const actor = await requirePlatformOwner('incidents.write')
  const data = incidentEditSchema.parse(input)
  return prisma.$transaction(async tx => {
    const grant = await tx.platformGrant.findUnique({ where: { userId: actor.id } })
    if (!grant || grant.role !== 'OWNER' || grant.revokedAt) throw new OperationsAccessError(403, 'PLATFORM_ACCESS_DENIED')
    if (data.assignedToUserId) {
      const assignee = await tx.platformGrant.findFirst({ where: { userId: data.assignedToUserId, role: 'OWNER', revokedAt: null, user: { isActive: true } } })
      if (!assignee) throw new OperationsAccessError(400, 'INVALID_ASSIGNEE')
    }
    const previous = await tx.diagnosticIncident.findUnique({ where: { id } })
    if (!previous) throw new OperationsAccessError(404, 'NOT_FOUND')
    const { note, revision, ...fields } = data
    const result = await tx.diagnosticIncident.updateMany({ where: { id, revision }, data: {
      ...fields, revision: { increment: 1 }, resolvedAt: data.status === 'RESOLVED' ? previous.resolvedAt ?? new Date() : null,
    } })
    if (!result.count) throw new OperationsAccessError(409, 'INCIDENT_CHANGED')
    await tx.platformAudit.create({ data: { actorUserId: actor.id, action: 'incident.updated', targetId: id,
      details: { note, previousStatus: previous.status, previousAssignee: previous.assignedToUserId, previousRevision: revision, ...fields } } })
    return { revision: revision + 1 }
  })
}
