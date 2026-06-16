import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'
import { parseCuantiaForStorage } from '@/lib/utils/cuantia'
import { DemandaCreateSchema } from '@/lib/validations/demanda'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return withApiUser(req, 'create demanda', async user => {
    const data = parseApiInput(DemandaCreateSchema, await req.json())
    const ejecutados = data.ejecutados ?? []

    const [tribunal, abogado, materia, procurador, duplicate] = await Promise.all([
      prisma.tribunal.findFirst({ where: { id: data.tribunalId, officeId: user.officeId } }),
      prisma.abogado.findFirst({ where: { id: data.abogadoId, officeId: user.officeId } }),
      data.materiaId ? prisma.materia.findFirst({ where: { id: data.materiaId, officeId: user.officeId } }) : null,
      data.procuradorId ? prisma.procurador.findFirst({ where: { id: data.procuradorId, officeId: user.officeId } }) : null,
      prisma.demanda.findFirst({ where: { officeId: user.officeId, rol: data.rol }, select: { id: true } }),
    ])

    if (!tribunal) throw new ApiError('NOT_FOUND', 'Tribunal no encontrado o fuera de tu oficina', 404)
    if (!abogado) throw new ApiError('NOT_FOUND', 'Abogado no encontrado o fuera de tu oficina', 404)
    if (data.materiaId && !materia) throw new ApiError('NOT_FOUND', 'Materia no encontrada o fuera de tu oficina', 404)
    if (data.procuradorId && !procurador) throw new ApiError('NOT_FOUND', 'Procurador no encontrado o fuera de tu oficina', 404)
    if (duplicate) throw new ApiError('CONFLICT', `Ya existe una causa con el ROL ${data.rol}`, 409)

    const result = await prisma.$transaction(async tx => {
      const demanda = await tx.demanda.create({
        data: {
          rol: data.rol,
          caratula: data.caratula,
          cuantia: parseCuantiaForStorage(data.cuantia),
          abogadoId: data.abogadoId,
          materiaId: data.materiaId ?? null,
          procuradorId: data.procuradorId ?? null,
          officeId: user.officeId,
          userId: user.id,
          ejecutados: ejecutados.length ? {
            create: ejecutados.map(ejecutado => ({
              nombre: ejecutado.nombre,
              rut: ejecutado.rut,
              direccion: ejecutado.direccion || null,
              comunaId: ejecutado.comunaId ?? null,
            })),
          } : undefined,
        },
        include: {
          abogados: { select: { id: true, nombre: true } },
          ejecutados: { include: { comunas: { select: { id: true, nombre: true } } } },
        },
      })
      const rolCausa = await tx.rolCausa.create({
        data: {
          id: demanda.id,
          demandaId: demanda.id,
          rol: demanda.rol,
          officeId: demanda.officeId,
          tribunalId: tribunal.id,
          estado: 'pendiente',
          createdAt: demanda.createdAt,
        },
        include: { tribunal: true },
      })
      return { ...demanda, tribunal: rolCausa.tribunal, rolId: rolCausa.id }
    }, { timeout: 15000 })

    return apiSuccess(result, 201)
  })
}
