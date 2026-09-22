import 'server-only'
import type { Prisma } from '@prisma/client'

/** General metadata editors must not replace the server-owned event identity.
 * Read it under the workflow lock, not from a pre-transaction form snapshot.
 */
export async function completionMetadataForUpdate(tx: Prisma.TransactionClient, diligenceId: string,
  proposed: Prisma.JsonObject): Promise<Prisma.JsonObject> {
  const current = await tx.diligencia.findUniqueOrThrow({ where: { id: diligenceId }, select: { meta: true } })
  const stored = current.meta && typeof current.meta === 'object' && !Array.isArray(current.meta) ? current.meta : {}
  const result = { ...proposed }
  for (const key of ['signingCompletionEventId', 'completadaEn']) {
    delete result[key]
    if (typeof stored[key] === 'string') result[key] = stored[key]
  }
  return result
}
