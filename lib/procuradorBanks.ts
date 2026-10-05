import type { PrismaClient, Prisma } from '@prisma/client'

export async function validateProcuradorBanks(
  db: PrismaClient | Prisma.TransactionClient,
  officeId: number,
  abogadoIds: number[],
  bancoIds: number[],
) {
  if (!bancoIds.length) return
  const links = await db.abogadoBanco.findMany({
    where: { officeId, abogadoId: { in: abogadoIds }, bancoId: { in: bancoIds }, banco: { officeId } },
    select: { bancoId: true },
  })
  if (bancoIds.some(id => !links.some(link => link.bancoId === id))) {
    throw new Error('Selecciona solamente bancos asociados a los abogados asignados de tu oficina')
  }
}
