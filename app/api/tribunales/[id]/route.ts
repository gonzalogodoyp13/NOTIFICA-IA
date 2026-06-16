import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'
import { TribunalSchema } from '@/lib/zodSchemas'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiUser(req, 'update tribunal', async user => {
    const existing = await prisma.tribunal.findFirst({ where: { id: params.id, officeId: user.officeId } })
    if (!existing) throw new ApiError('NOT_FOUND', 'Tribunal no encontrado', 404)
    const data = parseApiInput(TribunalSchema, await req.json())
    return apiSuccess(await prisma.tribunal.update({ where: { id: existing.id }, data }))
  })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiUser(req, 'delete tribunal', async user => {
    const existing = await prisma.tribunal.findFirst({
      where: { id: params.id, officeId: user.officeId },
      select: { id: true, _count: { select: { roles: true } } },
    })
    if (!existing) throw new ApiError('NOT_FOUND', 'Tribunal no encontrado', 404)
    if (existing._count.roles > 0) {
      throw new ApiError('CONFLICT', 'No se puede eliminar un tribunal asociado a causas', 409)
    }
    await prisma.tribunal.delete({ where: { id: existing.id } })
    return apiSuccess({ deleted: true })
  })
}
