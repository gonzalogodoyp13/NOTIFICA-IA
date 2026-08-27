import 'server-only'

import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { ApiError } from '@/lib/api/server'
import { recordBestEffortEvent } from '@/lib/audit/activityEvent'
import { prisma } from '@/lib/prisma'

export const RecipientConfigUpdateSchema = z.object({
  revision: z.number().int().positive(),
  recipients: z.array(z.object({
    userId: z.string().min(1).max(120),
    dailyEnabled: z.boolean(),
    monthlyEnabled: z.boolean(),
    customEnabled: z.boolean(),
  }).strict()).max(200),
}).strict()

export type RecipientKind = 'daily' | 'monthly' | 'custom'

export async function ensureRecipientConfigurations(officeId: number) {
  const admins = await prisma.user.findMany({
    where: { officeId, isActive: true, isOfficeAdmin: true },
    select: { id: true },
  })
  if (!admins.length) return
  await prisma.reportRecipientConfig.createMany({
    data: admins.map(admin => ({
      id: `recipient-${officeId}-${admin.id}`,
      officeId,
      userId: admin.id,
      dailyEnabled: true,
      monthlyEnabled: true,
      customEnabled: false,
      isEnabled: true,
      updatedAt: new Date(),
    })),
    skipDuplicates: true,
  })
}

export async function getRecipientConfiguration(officeId: number) {
  await ensureRecipientConfigurations(officeId)
  const [office, administrators] = await Promise.all([
    prisma.office.findUnique({ where: { id: officeId }, select: { reportConfigRevision: true } }),
    prisma.user.findMany({
      where: { officeId, isOfficeAdmin: true },
      orderBy: [{ isActive: 'desc' }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        isActive: true,
        reportRecipientConfiguration: {
          select: { dailyEnabled: true, monthlyEnabled: true, customEnabled: true, isEnabled: true, updatedAt: true },
        },
      },
    }),
  ])
  return {
    revision: office?.reportConfigRevision ?? 1,
    recipients: administrators.map(admin => ({
      userId: admin.id,
      email: admin.email,
      active: admin.isActive,
      dailyEnabled: !!admin.reportRecipientConfiguration?.isEnabled && !!admin.reportRecipientConfiguration.dailyEnabled,
      monthlyEnabled: !!admin.reportRecipientConfiguration?.isEnabled && !!admin.reportRecipientConfiguration.monthlyEnabled,
      customEnabled: !!admin.reportRecipientConfiguration?.isEnabled && !!admin.reportRecipientConfiguration.customEnabled,
      updatedAt: admin.reportRecipientConfiguration?.updatedAt ?? null,
    })),
  }
}

export async function updateRecipientConfiguration(input: {
  officeId: number
  actorUserId: string
  requestId?: string
  revision: number
  recipients: Array<{ userId: string; dailyEnabled: boolean; monthlyEnabled: boolean; customEnabled: boolean }>
}) {
  const uniqueIds = Array.from(new Set(input.recipients.map(item => item.userId)))
  if (uniqueIds.length !== input.recipients.length) throw new ApiError('VALIDATION_ERROR', 'Cada administrador debe aparecer una sola vez.', 400)
  const validUsers = await prisma.user.findMany({
    where: { officeId: input.officeId, id: { in: uniqueIds }, isActive: true, isOfficeAdmin: true },
    select: { id: true },
  })
  if (validUsers.length !== uniqueIds.length) throw new ApiError('VALIDATION_ERROR', 'Solo se pueden configurar administradores activos de la misma oficina.', 400)

  const saved = await prisma.$transaction(async tx => {
    const updatedOffice = await tx.office.updateMany({
      where: { id: input.officeId, reportConfigRevision: input.revision },
      data: { reportConfigRevision: { increment: 1 } },
    })
    if (!updatedOffice.count) throw new ApiError('CONFLICT', 'La configuración cambió en otra sesión. Recarga antes de guardar.', 409)
    for (const item of input.recipients) {
      await tx.reportRecipientConfig.upsert({
        where: { officeId_userId: { officeId: input.officeId, userId: item.userId } },
        create: {
          officeId: input.officeId,
          userId: item.userId,
          dailyEnabled: item.dailyEnabled,
          monthlyEnabled: item.monthlyEnabled,
          customEnabled: item.customEnabled,
          isEnabled: true,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
        update: {
          dailyEnabled: item.dailyEnabled,
          monthlyEnabled: item.monthlyEnabled,
          customEnabled: item.customEnabled,
          isEnabled: true,
          updatedByUserId: input.actorUserId,
        },
      })
    }
    return tx.office.findUniqueOrThrow({ where: { id: input.officeId }, select: { reportConfigRevision: true } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  const counts = input.recipients.reduce((value, item) => ({
    daily: value.daily + Number(item.dailyEnabled),
    monthly: value.monthly + Number(item.monthlyEnabled),
    custom: value.custom + Number(item.customEnabled),
  }), { daily: 0, monthly: 0, custom: 0 })
  await recordBestEffortEvent({ id: input.actorUserId, officeId: input.officeId, requestId: input.requestId }, {
    eventType: 'report.recipients.changed',
    module: 'reports',
    result: 'success',
    description: 'Configuración de destinatarios actualizada.',
    metadata: { revision: saved.reportConfigRevision, administratorCount: input.recipients.length, ...counts },
  })
  return getRecipientConfiguration(input.officeId)
}

export async function configuredRecipients(input: { officeId: number; kind: RecipientKind; definitionId?: string | null; userIds?: string[] }) {
  await ensureRecipientConfigurations(input.officeId)
  const enabledField = input.kind === 'daily' ? 'dailyEnabled' : input.kind === 'monthly' ? 'monthlyEnabled' : 'customEnabled'
  const definitionIds = input.kind === 'custom' && input.definitionId
    ? (await prisma.customReportDefinitionRecipient.findMany({ where: { definitionId: input.definitionId }, select: { userId: true } })).map(row => row.userId)
    : null
  const ids = input.userIds ?? definitionIds ?? undefined
  return prisma.user.findMany({
    where: {
      officeId: input.officeId,
      isActive: true,
      isOfficeAdmin: true,
      ...(ids ? { id: { in: ids } } : {}),
      reportRecipientConfiguration: { is: { officeId: input.officeId, isEnabled: true, [enabledField]: true } },
    },
    orderBy: { email: 'asc' },
    select: { id: true, email: true },
  })
}
