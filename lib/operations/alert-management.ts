import 'server-only'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requirePlatformOwner, OperationsAccessError } from './auth'
import { alertPolicySchema, defaultAlertPolicy } from './alert-policy'

const id = z.string().regex(/^[a-zA-Z0-9_:-]{1,180}$/)
const reason = z.string().trim().min(5).max(300).refine(v => !/-----BEGIN|(?:password|secret|token|cookie|authorization|pin|contraseña)\s*[:=]/i.test(v))
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('policy'), officeId: z.number().int().positive().nullable(), revision: z.number().int().min(0), settings: alertPolicySchema }),
  z.object({ action: z.literal('maintenance'), officeId: z.number().int().positive().nullable(), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), reason }),
  z.object({ action: z.literal('cancel-maintenance'), id, reason }),
  z.object({ action: z.enum(['acknowledge','verify-recovery']), id, revision: z.number().int().min(0), reason }),
])
export async function manageAlerts(input: unknown) {
  const actor = await requirePlatformOwner('alerts.manage'), data = schema.parse(input)
  return prisma.$transaction(async tx => {
    const grant = await tx.platformGrant.findFirst({ where: { userId: actor.id, role: 'OWNER', revokedAt: null, user: { isActive: true } } })
    if (!grant) throw new OperationsAccessError(403, 'PLATFORM_ACCESS_DENIED')
    if ('officeId' in data && data.officeId && !await tx.office.findUnique({ where: { id: data.officeId }, select: { id: true } })) throw new OperationsAccessError(400, 'INVALID_OFFICE')
    let target = '', result: unknown
    if (data.action === 'policy') {
      const recipients = [...new Set(data.settings.recipients)]
      const authorized = await tx.platformGrant.count({ where: { userId: { in: recipients }, role: 'OWNER', revokedAt: null, user: { isActive: true } } })
      if (authorized !== recipients.length || data.settings.enabled && !recipients.length) throw new OperationsAccessError(400, 'INVALID_RECIPIENTS')
      target = data.officeId ? `office:${data.officeId}` : 'global'
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ops-policy:${target}`}))`
      const previous = await tx.operationsPolicy.findUnique({ where: { key: target } })
      if ((previous?.revision ?? 0) !== data.revision) throw new OperationsAccessError(409, 'POLICY_CHANGED')
      result = await tx.operationsPolicy.upsert({ where: { key: target }, create: { key: target, settings: { ...data.settings, recipients }, revision: 1 }, update: { settings: { ...data.settings, recipients }, revision: { increment: 1 } } })
    } else if (data.action === 'maintenance') {
      const startsAt = new Date(data.startsAt), endsAt = new Date(data.endsAt)
      if (endsAt <= startsAt || endsAt <= new Date() || endsAt.getTime() - startsAt.getTime() > 7 * 86400000) throw new OperationsAccessError(400, 'INVALID_MAINTENANCE_WINDOW')
      const row = await tx.operationsMaintenance.create({ data: { officeId: data.officeId, startsAt, endsAt, reason: data.reason } }); target = row.id; result = row
    } else if (data.action === 'cancel-maintenance') {
      target = data.id; result = await tx.operationsMaintenance.updateMany({ where: { id: data.id, cancelledAt: null }, data: { cancelledAt: new Date() } })
    } else {
      target = data.id
      const updated = await tx.operationsAlert.updateMany({ where: { key: data.id, revision: data.revision, status: data.action === 'acknowledge' ? 'OPEN' : 'RECOVERY_PENDING' }, data: { status: data.action === 'acknowledge' ? 'ACKNOWLEDGED' : 'RESOLVED', revision: { increment: 1 } } })
      if (!updated.count) throw new OperationsAccessError(409, 'ALERT_CHANGED')
      result = { ok: true }
    }
    let auditOffice: number | null = 'officeId' in data ? data.officeId : null
    if (data.action === 'cancel-maintenance') auditOffice = (await tx.operationsMaintenance.findUnique({ where: { id: data.id }, select: { officeId: true } }))?.officeId ?? null
    if (data.action === 'acknowledge' || data.action === 'verify-recovery') auditOffice = (await tx.operationsAlert.findUnique({ where: { key: data.id }, select: { officeId: true } }))?.officeId ?? null
    await tx.platformAudit.create({ data: { actorUserId: actor.id, action: `alerts.${data.action}`, targetId: target, details: { ...JSON.parse(JSON.stringify(data)), officeId: auditOffice } } })
    return result
  })
}
export async function alertConfiguration(officeId?: number) {
  await requirePlatformOwner('alerts.manage')
  const key = officeId ? `office:${officeId}` : 'global'
  const [record, owners] = await Promise.all([
    prisma.operationsPolicy.findUnique({ where: { key } }),
    prisma.platformGrant.findMany({ where: { role: 'OWNER', revokedAt: null, user: { isActive: true } }, take: 21, orderBy: { userId: 'asc' }, select: { userId: true, user: { select: { email: true } } } }),
  ])
  return { officeId: officeId ?? null, revision: record?.revision ?? 0, settings: record ? alertPolicySchema.parse(record.settings) : defaultAlertPolicy(), owners: owners.slice(0,20).map(o => ({ id: o.userId, email: o.user.email })) }
}
