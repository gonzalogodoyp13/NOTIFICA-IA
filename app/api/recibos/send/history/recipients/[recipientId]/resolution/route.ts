import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { recordOperationalActivity } from '@/lib/audit/operationalActivity'
import { prisma } from '@/lib/prisma'
import { requiresResolutionNote } from '@/lib/recibos/smart-control-core'
import { DispatchResolutionSchema } from '@/lib/validations/recibos'

export async function PATCH(req: NextRequest, { params }: { params: { recipientId: string } }) {
  return withApiUser(req, 'resolve receipt dispatch', async user => {
    const input = parseApiInput(DispatchResolutionSchema, await req.json())
    const recipient = await prisma.recibosDispatchRecipient.findFirst({
      where: { id: params.recipientId, batch: { officeId: user.officeId } },
      include: { replies: { where: { confirmedClassification: { not: null } }, orderBy: { receivedAt: 'desc' }, take: 1 } },
    })
    if (!recipient) throw new ApiError('NOT_FOUND', 'El envio no existe.', 404)
    const classification = recipient.replies[0]?.confirmedClassification
    if (input.resolved && requiresResolutionNote(classification) && !input.note) throw new ApiError('VALIDATION_ERROR', 'Agrega una nota para resolver un envio observado o que requiere correccion.', 400)
    const updated = await prisma.recibosDispatchRecipient.update({
      where: { id: recipient.id },
      data: input.resolved ? { resolvedAt: new Date(), resolvedByUserId: user.id, resolutionNote: input.note ?? null } : { resolvedAt: null, resolvedByUserId: null, resolutionNote: null },
    })
    await recordOperationalActivity({ userId: user.id, officeId: user.officeId, eventType: 'receipt_resolution', count: 1, details: { recipientId: recipient.id, action: input.resolved ? 'resolved' : 'reopened', hasNote: !!input.note } })
    return apiSuccess({ id: updated.id, resolvedAt: updated.resolvedAt?.toISOString() ?? null, resolutionNote: updated.resolutionNote })
  })
}
