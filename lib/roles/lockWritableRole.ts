import 'server-only'
import { Prisma } from '@prisma/client'
import { ApiError } from '@/lib/api/server'

export async function lockWritableRole(tx: Prisma.TransactionClient, id: string, officeId: number) {
  // The no-op update locks the parent until commit, serializing with status updates.
  const result = await tx.rolCausa.updateMany({
    where: { id, officeId, estado: { notIn: ['terminado', 'archivado'] } },
    data: { id },
  })
  if (result.count !== 1) throw new ApiError('ROLE_READ_ONLY', 'La causa está terminada o archivada y no se puede modificar.', 409)
}
