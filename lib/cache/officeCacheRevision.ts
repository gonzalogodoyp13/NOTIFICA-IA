import 'server-only'

import type { Prisma } from '@prisma/client'

export async function bumpOfficeCacheRevision(
  tx: Pick<Prisma.TransactionClient, 'office'>,
  officeId: number
) {
  const office = await tx.office.update({
    where: { id: officeId },
    data: { cacheRevision: { increment: 1 } },
    select: { cacheRevision: true },
  })
  return office.cacheRevision
}
