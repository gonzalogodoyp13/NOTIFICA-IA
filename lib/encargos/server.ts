import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { GuardarEncargo } from './schema'

function disponiblesEnCorte(corte: string): Prisma.ReceptorPortalWhereInput {
  return { cortes: { has: corte }, disponible: true, user: { isActive: true } }
}

export async function buscarReceptores(corte: string) {
  const receptores = await prisma.receptorPortal.findMany({
    where: disponiblesEnCorte(corte),
    select: { userId: true, nombre: true },
    orderBy: [{ nombre: 'asc' }, { userId: 'asc' }],
  })
  return receptores.map(({ userId, nombre }) => ({ id: userId, nombre }))
}

export function receptorPreseleccionado(userId: string, corte: string, tribunal: string) {
  return prisma.receptorPortal.findFirst({
    where: { ...disponiblesEnCorte(corte), userId, ...(tribunal && { tribunales: { has: tribunal } }) },
    select: { userId: true, nombre: true },
  })
}

export async function guardarEncargo(abogadoId: string, { id, accion, datos }: GuardarEncargo) {
  const enviar = accion === 'enviar'
  const receptorIds = [...new Set(datos.receptorIds)]
  return prisma.$transaction(async tx => {
    const activos = await tx.$queryRaw<Array<{ authUserId: string }>>`
      SELECT "authUserId" FROM public.abogado_accounts
      WHERE "authUserId" = ${abogadoId}::uuid AND "desactivadoAt" IS NULL
      FOR SHARE
    `
    if (!activos.length) return 'cuenta-desactivada'
    const existente = await tx.abogadoEncargo.findUnique({ where: { id }, select: { abogadoId: true, enviadoAt: true } })
    if (existente && existente.abogadoId !== abogadoId) return 'no-encontrado'
    if (existente?.enviadoAt) return enviar ? 'enviado' : 'ya-enviado'

    const receptores = receptorIds.length ? await tx.receptorPortal.findMany({
      where: { ...disponiblesEnCorte(datos.causa.corte), userId: { in: receptorIds } }, select: { userId: true },
    }) : []
    if (enviar && receptores.length !== receptorIds.length) return 'receptor-no-disponible'

    const { corte, tribunal, rol } = datos.causa
    const boleta = enviar && !datos.boleta.aNombreDe ? { ...datos.boleta, aNombreDe: datos.boleta.nombre } : datos.boleta
    const draft = { corte, tribunal, rol, datos: { ...datos, boleta, receptorIds: receptores.map(({ userId }) => userId) } }
    const where = { id, abogadoId, enviadoAt: null }
    if (!existente) await tx.abogadoEncargo.createMany({ data: [{ ...draft, id, abogadoId }], skipDuplicates: true })
    const changed = await tx.abogadoEncargo.updateMany({
      where, data: { ...draft, enviadoAt: enviar ? new Date() : null },
    })
    if (!changed.count) {
      const concurrente = await tx.abogadoEncargo.findFirst({ where: { id, abogadoId }, select: { enviadoAt: true } })
      return concurrente?.enviadoAt ? (enviar ? 'enviado' : 'ya-enviado') : 'no-encontrado'
    }
    if (enviar) await tx.abogadoEncargoReceptor.createMany({ data: receptores.map(({ userId }) => ({ encargoId: id, receptorId: userId })) })
    return enviar ? 'enviado' : 'borrador'
  })
}
