import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'
import { TribunalSchema } from '@/lib/zodSchemas'
import { recordSettingsEvent } from '@/lib/audit/businessEvents'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'list tribunals', async user => {
    const tribunales = await prisma.tribunal.findMany({
      where: { officeId: user.officeId },
      orderBy: [{ nombre: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    })
    return apiSuccess(tribunales)
  })
}

export async function POST(req: NextRequest) {
  return withApiUser(req, 'create tribunal', async user => {
    const data = parseApiInput(TribunalSchema, await req.json())
    const duplicate = await prisma.tribunal.findFirst({
      where: { officeId: user.officeId, nombre: { equals: data.nombre, mode: 'insensitive' } },
      select: { id: true },
    })
    if (duplicate) throw new ApiError('CONFLICT', 'Ya existe un tribunal con ese nombre', 409)
    const created = await prisma.$transaction(async tx => {
      const tribunal = await tx.tribunal.create({ data: { ...data, officeId: user.officeId } })
      await recordSettingsEvent(tx, user, { resource: 'Tribunal', action: 'created', recordId: tribunal.id })
      return tribunal
    })
    return apiSuccess(created, 201)
  })
}
