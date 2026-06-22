import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { recordOperationalActivity } from '@/lib/audit/operationalActivity'
import { prisma } from '@/lib/prisma'
import { ReplyClassificationSchema } from '@/lib/validations/recibos'

export async function PATCH(req: NextRequest, { params }: { params: { replyId: string } }) {
  return withApiUser(req, 'classify receipt reply', async user => {
    const input = parseApiInput(ReplyClassificationSchema, await req.json())
    const reply = await prisma.recibosDispatchReply.findFirst({ where: { id: params.replyId, officeId: user.officeId }, select: { id: true, recipientId: true } })
    if (!reply) throw new ApiError('NOT_FOUND', 'La respuesta no existe.', 404)
    const updated = await prisma.recibosDispatchReply.update({ where: { id: reply.id }, data: { confirmedClassification: input.classification, classifiedByUserId: user.id, classifiedAt: new Date() } })
    await recordOperationalActivity({ userId: user.id, officeId: user.officeId, eventType: 'receipt_reply_classify', count: 1, details: { replyId: reply.id, recipientId: reply.recipientId, classification: input.classification } })
    return apiSuccess({ id: updated.id, confirmedClassification: updated.confirmedClassification, classifiedAt: updated.classifiedAt?.toISOString() ?? null })
  })
}
