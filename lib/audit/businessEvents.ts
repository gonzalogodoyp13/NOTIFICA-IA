import 'server-only'

import { Prisma } from '@prisma/client'

import { recordCriticalEvent, type ActivityContext } from '@/lib/audit/activityEvent'

export async function recordSettingsEvent(
  tx: Pick<Prisma.TransactionClient, 'activityEvent'>,
  context: ActivityContext,
  input: {
    resource: string
    action: 'created' | 'updated' | 'deleted' | 'reset' | 'toggled'
    recordId: string | number
    changedFields?: string[]
  }
) {
  return recordCriticalEvent(tx, context, {
    eventType: `settings.${input.resource}.${input.action}`,
    module: 'settings',
    result: 'success',
    recordType: input.resource,
    recordId: input.recordId,
    description: `Configuracion ${input.resource} ${input.action}.`,
    metadata: {
      resource: input.resource,
      resourceId: String(input.recordId),
      changedFields: input.changedFields?.slice(0, 100),
    },
  })
}
