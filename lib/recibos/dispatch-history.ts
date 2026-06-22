import 'server-only'

import { prisma } from '@/lib/prisma'
import { dispatchStatusLabel, replyState } from '@/lib/recibos/dispatch-history-core'
import { deriveOperationalState, type OperationalState } from '@/lib/recibos/smart-control-core'

export async function listRecibosDispatchHistory(officeId: number, limit = 20, state?: OperationalState) {
  const batches = await prisma.recibosDispatchBatch.findMany({
    where: { officeId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { email: true } },
      recipients: {
        select: {
          recipientName: true,
          recipientType: true,
          recipientEmails: true,
          reciboCount: true,
          totalAmount: true,
          status: true,
          hasReplies: true,
          replyCount: true,
          lastReplyAt: true,
          sentAt: true,
          resolvedAt: true,
        },
      },
    },
  })

  const mapped = batches.map(batch => {
    const totalAmount = batch.recipients.reduce((sum, recipient) => sum + recipient.totalAmount, 0)
    const recipientNames = Array.from(new Set(batch.recipients.map(recipient => recipient.recipientName).filter(Boolean)))
    const recipientTypes = Array.from(new Set(batch.recipients.map(recipient => recipient.recipientType).filter(Boolean)))
    const recipientReplyCount = batch.recipients.reduce((sum, recipient) => sum + recipient.replyCount, 0)
    const replyCount = Math.max(batch.replyCount, recipientReplyCount)
    const recipientLastReplyAt = batch.recipients.reduce<Date | null>((latest, recipient) => {
      if (!recipient.lastReplyAt) return latest
      return !latest || recipient.lastReplyAt > latest ? recipient.lastReplyAt : latest
    }, null)
    const recipientStates = batch.recipients.map(recipient => deriveOperationalState({ status: recipient.status, provider: batch.provider, dispatchKind: batch.dispatchKind, sentAt: recipient.sentAt, replyCount: recipient.replyCount, resolvedAt: recipient.resolvedAt }))
    const operationalState: OperationalState = recipientStates.length && recipientStates.every(value => value === 'resolved') ? 'resolved'
      : recipientStates.includes('overdue') ? 'overdue'
      : recipientStates.includes('waiting') ? 'waiting'
      : recipientStates.includes('replied') ? 'replied'
      : batch.status === 'failed' ? 'failed' : 'sent'
    return {
      id: batch.id,
      createdAt: batch.createdAt.toISOString(),
      sentAt: batch.sentAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
      senderEmail: batch.user.email,
      provider: batch.provider,
      dispatchKind: batch.dispatchKind,
      operationalState,
      fromAccount: batch.fromAccount,
      recipientMode: batch.recipientMode,
      recipientSummary: recipientNames.length <= 2 ? recipientNames.join(', ') : `${recipientNames.slice(0, 2).join(', ')} +${recipientNames.length - 2}`,
      recipientType: recipientTypes.length === 1 ? recipientTypes[0] : batch.recipientMode,
      reciboCount: batch.recipients.reduce((sum, recipient) => sum + recipient.reciboCount, 0),
      totalAmount,
      status: batch.status,
      statusLabel: dispatchStatusLabel(batch.status),
      selectedCount: batch.selectedCount,
      excludedCount: batch.excludedCount,
      groupCount: batch.groupCount,
      sentCount: batch.sentCount,
      failedCount: batch.failedCount,
      skippedCount: batch.skippedCount,
      hasReplies: batch.hasReplies || batch.recipients.some(recipient => recipient.hasReplies),
      replyCount,
      lastReplyAt: (batch.lastReplyAt ?? recipientLastReplyAt)?.toISOString() ?? null,
      replyState: replyState(replyCount),
    }
  })
  return mapped.filter(item => !state || item.operationalState === state).slice(0, Math.min(Math.max(limit, 1), 50))
}

export async function getRecibosDispatchHistoryDetail(officeId: number, batchId: string) {
  const batch = await prisma.recibosDispatchBatch.findFirst({
    where: { id: batchId, officeId },
    include: {
      user: { select: { email: true } },
      recipients: {
        orderBy: { createdAt: 'asc' },
        include: {
          items: { orderBy: { createdAt: 'asc' } },
          replies: {
            where: { matchStatus: 'matched' },
            orderBy: { receivedAt: 'asc' },
            include: { attachments: { orderBy: { createdAt: 'asc' } } },
          },
        },
      },
    },
  })
  if (!batch) return null

  return {
    id: batch.id,
    createdAt: batch.createdAt.toISOString(),
    sentAt: batch.sentAt?.toISOString() ?? null,
    completedAt: batch.completedAt?.toISOString() ?? null,
    senderEmail: batch.user.email,
    provider: batch.provider,
    dispatchKind: batch.dispatchKind,
    fromAccount: batch.fromAccount,
    recipientMode: batch.recipientMode,
    status: batch.status,
    statusLabel: dispatchStatusLabel(batch.status),
    selectedCount: batch.selectedCount,
    excludedCount: batch.excludedCount,
    groupCount: batch.groupCount,
    sentCount: batch.sentCount,
    failedCount: batch.failedCount,
    skippedCount: batch.skippedCount,
    templateMode: batch.templateMode,
    errorMessage: batch.errorMessage,
    hasReplies: batch.hasReplies,
    replyCount: batch.replyCount,
    lastReplyAt: batch.lastReplyAt?.toISOString() ?? null,
    replyState: replyState(batch.replyCount),
    recipients: batch.recipients.map(recipient => ({
      id: recipient.id,
      groupKey: recipient.groupKey,
      recipientType: recipient.recipientType,
      recipientName: recipient.recipientName,
      recipientEmails: recipient.recipientEmails,
      subject: recipient.subject,
      body: recipient.body,
      status: recipient.status,
      statusLabel: dispatchStatusLabel(recipient.status),
      attemptCount: recipient.attemptCount,
      providerMessageId: recipient.providerMessageId,
      providerThreadId: recipient.providerThreadId,
      attachmentFilename: recipient.attachmentFilename,
      attachmentMimeType: recipient.attachmentMimeType,
      attachmentByteSize: recipient.attachmentByteSize,
      attachmentSha256: recipient.attachmentSha256,
      reciboCount: recipient.reciboCount,
      totalAmount: recipient.totalAmount,
      warningSummary: recipient.warningSummary,
      errorMessage: recipient.errorMessage,
      operationalState: deriveOperationalState({ status: recipient.status, provider: batch.provider, dispatchKind: batch.dispatchKind, sentAt: recipient.sentAt, replyCount: recipient.replyCount, resolvedAt: recipient.resolvedAt }),
      resolvedAt: recipient.resolvedAt?.toISOString() ?? null,
      resolutionNote: recipient.resolutionNote,
      resendOfRecipientId: recipient.resendOfRecipientId,
      resendReason: recipient.resendReason,
      duplicateOverrideReason: recipient.duplicateOverrideReason,
      sentAt: recipient.sentAt?.toISOString() ?? null,
      completedAt: recipient.completedAt?.toISOString() ?? null,
      hasReplies: recipient.hasReplies,
      replyCount: recipient.replyCount,
      lastReplyAt: recipient.lastReplyAt?.toISOString() ?? null,
      replyState: replyState(recipient.replyCount),
      replies: recipient.replies.map(reply => ({
        id: reply.id,
        provider: reply.provider,
        senderName: reply.senderName,
        senderEmail: reply.senderEmail,
        subject: reply.subject,
        textPreview: reply.textPreview,
        bodyText: reply.bodyText,
        receivedAt: reply.receivedAt.toISOString(),
        matchMethod: reply.matchMethod,
        suggestedClassification: reply.suggestedClassification,
        confirmedClassification: reply.confirmedClassification,
        classifiedAt: reply.classifiedAt?.toISOString() ?? null,
        attachments: reply.attachments.map(attachment => ({
          id: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          byteSize: attachment.byteSize,
          isInline: attachment.isInline,
        })),
      })),
      items: recipient.items.map(item => ({
        id: item.id,
        reciboId: item.reciboId,
        numeroRecibo: item.numeroRecibo,
        rol: item.rol,
        monto: item.monto,
        fechaEjecucion: item.fechaEjecucion?.toISOString() ?? null,
      })),
    })),
  }
}
