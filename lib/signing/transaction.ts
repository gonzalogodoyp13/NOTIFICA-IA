import 'server-only'
import type { Prisma, PrismaClient } from '@prisma/client'
import { SigningContextSchema, type SigningContext } from './core'

export async function lockSigningOffice(tx: Prisma.TransactionClient, officeId: number) {
  if (!Number.isSafeInteger(officeId) || officeId <= 0) throw new Error('Invalid office')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(734201, ${officeId}::integer)`
  const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
  return clock.now
}

/** Take the same lock as signing workers BEFORE changing workflow/document rows.
 * The callback, derived completion, queue and critical audit share one commit.
 */
export function workflowTransaction<T>(db: PrismaClient, context: SigningContext,
  run: (tx: Prisma.TransactionClient) => Promise<T>) {
  SigningContextSchema.parse(context)
  return db.$transaction(async tx => {
    await lockSigningOffice(tx, context.officeId)
    return run(tx)
  }, { timeout: 30_000, maxWait: 15_000 })
}
