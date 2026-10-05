import { prisma } from '@/lib/prisma'

// Older API clients did not send bancoId. Resolve only unambiguous legacy values.
export async function resolveDemandaBank(officeId: number, abogadoId: number, caratula: string, bancoId?: number | null) {
  const links = await prisma.abogadoBanco.findMany({
    where: { officeId, abogadoId, banco: { officeId } },
    select: { banco: { select: { id: true, nombre: true } } },
  })
  if (bancoId !== undefined && bancoId !== null) {
    if (!Number.isInteger(bancoId) || !links.some(link => link.banco.id === bancoId)) {
      throw new Error('El banco seleccionado no pertenece al abogado de la demanda')
    }
    return bancoId
  }
  const prefix = caratula.split('/')[0].trim().toLowerCase()
  const matching = links.filter(link => link.banco.nombre.trim().toLowerCase() === prefix)
  return matching.length === 1 ? matching[0].banco.id : links.length === 1 ? links[0].banco.id : null
}
