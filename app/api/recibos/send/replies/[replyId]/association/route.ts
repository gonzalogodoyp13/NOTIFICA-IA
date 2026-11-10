import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'
import { recordCriticalEvent } from '@/lib/audit/activityEvent'

export async function GET(req: NextRequest, { params }: { params: { replyId: string } }) {
  return withApiUser(req, 'receipt reply association options', async user => {
    const reply = await prisma.recibosDispatchReply.findFirst({ where: { id: params.replyId, officeId: user.officeId } })
    if (!reply) throw new ApiError('NOT_FOUND', 'La respuesta no existe.', 404)
    const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 200)
    const items = await prisma.recibosDispatchRecipient.findMany({
      where: { status: 'sent', batch: { officeId: user.officeId, provider: reply.provider }, ...(q ? { OR: [{ subject: { contains: q, mode: 'insensitive' } }, { recipientName: { contains: q, mode: 'insensitive' } }] } : {}) },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }], take: 50,
      select: { id: true, subject: true, recipientName: true, recipientEmails: true, sentAt: true },
    })
    return apiSuccess({ items })
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { replyId: string } }) {
  return withApiUser(req, 'associate receipt reply', async user => {
    const input = parseApiInput(z.object({ recipientId: z.string().min(1), confirmed: z.literal(true) }).strict(), await req.json())
    await prisma.$transaction(async tx => {
      const reply = await tx.recibosDispatchReply.findFirst({ where: { id: params.replyId, officeId: user.officeId } })
      if (!reply) throw new ApiError('NOT_FOUND', 'La respuesta no existe.', 404)
      const recipient = await tx.recibosDispatchRecipient.findFirst({ where: { id: input.recipientId, status: 'sent', batch: { officeId: user.officeId, provider: reply.provider } } })
      if (!recipient) throw new ApiError('NOT_FOUND', 'El envío no está disponible.', 404)
      // Lock the batch before aggregates so concurrent associations cannot lose counts.
      await tx.recibosDispatchBatch.update({ where: { id: recipient.batchId }, data: { id: recipient.batchId } })
      const changed = await tx.recibosDispatchReply.updateMany({ where: { id: reply.id, officeId: user.officeId, recipientId: null, matchStatus: { in: ['unmatched', 'needs_review'] } }, data: { recipientId: recipient.id, matchStatus: 'matched', matchMethod: 'manual' } })
      if (changed.count !== 1) throw new ApiError('CONFLICT', 'La respuesta ya fue asociada. Actualiza la lista.', 409)
      const stats = await tx.recibosDispatchReply.aggregate({ where: { recipientId: recipient.id, matchStatus: 'matched' }, _count: { _all: true }, _max: { receivedAt: true } })
      const batchStats = await tx.recibosDispatchReply.aggregate({ where: { recipient: { batchId: recipient.batchId }, matchStatus: 'matched' }, _count: { _all: true }, _max: { receivedAt: true } })
      await tx.recibosDispatchRecipient.update({ where: { id: recipient.id }, data: { replyCount: stats._count._all, hasReplies: true, lastReplyAt: stats._max.receivedAt } })
      await tx.recibosDispatchBatch.update({ where: { id: recipient.batchId }, data: { replyCount: batchStats._count._all, hasReplies: true, lastReplyAt: batchStats._max.receivedAt } })
      await recordCriticalEvent(tx, user, { eventType: 'receipt.reply_associated', module: 'emails', result: 'success', recordType: 'RecibosDispatchReply', recordId: reply.id, description: 'Respuesta asociada manualmente a un envío.', metadata: { replyId: reply.id, recipientId: recipient.id } })
    })
    return apiSuccess({ id: params.replyId })
  })
}
