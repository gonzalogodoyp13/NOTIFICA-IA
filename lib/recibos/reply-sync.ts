import 'server-only'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { recordOperationalActivity } from '@/lib/audit/operationalActivity'
import { recordBestEffortEvent } from '@/lib/audit/activityEvent'
import { sanitizeDispatchError } from '@/lib/recibos/dispatch-history-core'
import { enabledReplyProviders, type ReplyProviderAdapter } from '@/lib/recibos/reply-providers'
import {
  isAutomaticMessage,
  matchReplyToDispatch,
  replyTextPreview,
  type DispatchMatchCandidate,
  type NormalizedReply,
} from '@/lib/recibos/reply-tracking-core'
import { CLASSIFICATION_RULE_VERSION, suggestReplyClassification } from '@/lib/recibos/smart-control-core'
import { recordProviderSuccess } from '@/lib/recibos/provider-health'
import { unmatchedReplyStatuses, type UnmatchedReplyStatusFilter } from '@/lib/recibos/unmatched-replies-core'

type ProviderSyncResult = {
  provider: string
  mailboxAddress: string
  checked: number
  matched: number
  unmatched: number
  needsReview: number
  duplicates: number
  ignored: number
  error: string | null
}

function stringArray(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

async function dispatchCandidates(officeId: number): Promise<DispatchMatchCandidate[]> {
  const recipients = await prisma.recibosDispatchRecipient.findMany({
    where: { status: 'sent', batch: { officeId, provider: { not: 'dry-run' } } },
    select: {
      id: true,
      providerMessageId: true,
      providerThreadId: true,
      providerInternetMessageId: true,
      trackingToken: true,
      recipientEmails: true,
      subject: true,
      sentAt: true,
      batch: { select: { provider: true } },
    },
  })
  return recipients.map(recipient => ({
    id: recipient.id,
    provider: recipient.batch.provider,
    providerMessageId: recipient.providerMessageId,
    providerThreadId: recipient.providerThreadId,
    providerInternetMessageId: recipient.providerInternetMessageId,
    trackingToken: recipient.trackingToken,
    recipientEmails: stringArray(recipient.recipientEmails),
    subject: recipient.subject,
    sentAt: recipient.sentAt,
  }))
}

async function refreshReplyAggregates(recipientId: string) {
  const recipient = await prisma.recibosDispatchRecipient.findUnique({ where: { id: recipientId }, select: { batchId: true } })
  if (!recipient) return
  const [recipientStats, batchStats] = await Promise.all([
    prisma.recibosDispatchReply.aggregate({
      where: { recipientId, matchStatus: 'matched' },
      _count: { _all: true },
      _max: { receivedAt: true },
    }),
    prisma.recibosDispatchReply.aggregate({
      where: { matchStatus: 'matched', recipient: { batchId: recipient.batchId } },
      _count: { _all: true },
      _max: { receivedAt: true },
    }),
  ])
  await prisma.$transaction([
    prisma.recibosDispatchRecipient.update({
      where: { id: recipientId },
      data: {
        replyCount: recipientStats._count._all,
        hasReplies: recipientStats._count._all > 0,
        lastReplyAt: recipientStats._max.receivedAt,
      },
    }),
    prisma.recibosDispatchBatch.update({
      where: { id: recipient.batchId },
      data: {
        replyCount: batchStats._count._all,
        hasReplies: batchStats._count._all > 0,
        lastReplyAt: batchStats._max.receivedAt,
      },
    }),
  ])
}

async function ingestReply(officeId: number, message: NormalizedReply, candidates: DispatchMatchCandidate[]) {
  const match = matchReplyToDispatch(message, candidates)
  const suggestedClassification = suggestReplyClassification(message.subject, message.bodyText)
  try {
    const reply = await prisma.recibosDispatchReply.create({
      data: {
        officeId,
        recipientId: match.recipientId,
        provider: message.provider,
        mailboxAddress: message.mailboxAddress,
        providerMessageId: message.providerMessageId,
        providerThreadId: message.providerThreadId ?? null,
        internetMessageId: message.internetMessageId ?? null,
        inReplyTo: message.inReplyTo ?? null,
        references: message.references satisfies Prisma.JsonArray,
        trackingToken: match.trackingToken,
        senderName: message.senderName ?? null,
        senderEmail: message.senderEmail,
        subject: message.subject,
        textPreview: replyTextPreview(message.bodyText),
        bodyText: message.bodyText,
        receivedAt: message.receivedAt,
        matchStatus: match.status,
        matchMethod: match.method,
        candidateRecipientIds: match.candidateRecipientIds satisfies Prisma.JsonArray,
        suggestedClassification,
        classificationRuleVersion: CLASSIFICATION_RULE_VERSION,
        attachments: {
          create: message.attachments.map(attachment => ({
            providerAttachmentId: attachment.providerAttachmentId ?? null,
            filename: attachment.filename,
            mimeType: attachment.mimeType ?? null,
            byteSize: attachment.byteSize ?? null,
            contentId: attachment.contentId ?? null,
            isInline: attachment.isInline ?? false,
          })),
        },
      },
    })
    if (reply.recipientId) await refreshReplyAggregates(reply.recipientId)
    return match.status
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'duplicate' as const
    throw error
  }
}

async function acquireCheckpoint(officeId: number, adapter: ReplyProviderAdapter) {
  const checkpoint = await prisma.recibosReplySyncCheckpoint.upsert({
    where: { officeId_provider_mailboxAddress: { officeId, provider: adapter.provider, mailboxAddress: adapter.mailboxAddress } },
    create: { officeId, provider: adapter.provider, mailboxAddress: adapter.mailboxAddress },
    update: {},
  })
  const staleBefore = new Date(Date.now() - 15 * 60_000)
  const acquired = await prisma.recibosReplySyncCheckpoint.updateMany({
    where: { id: checkpoint.id, OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
    data: { lockedAt: new Date(), lastAttemptedAt: new Date(), lastError: null },
  })
  return acquired.count ? checkpoint : null
}

async function syncProvider(officeId: number, adapter: ReplyProviderAdapter, candidates: DispatchMatchCandidate[]): Promise<ProviderSyncResult> {
  const result: ProviderSyncResult = { provider: adapter.provider, mailboxAddress: adapter.mailboxAddress, checked: 0, matched: 0, unmatched: 0, needsReview: 0, duplicates: 0, ignored: 0, error: null }
  const checkpoint = await acquireCheckpoint(officeId, adapter)
  if (!checkpoint) return { ...result, error: 'Sincronizacion ya en curso.' }
  try {
    const lookbackDays = Math.max(1, Number(process.env.REPLY_INITIAL_LOOKBACK_DAYS || 7))
    const polled = await adapter.poll({
      graphDeltaLink: checkpoint.graphDeltaLink,
      gmailUidValidity: checkpoint.gmailUidValidity,
      gmailLastUid: checkpoint.gmailLastUid,
    }, lookbackDays)
    for (const message of polled.messages) {
      result.checked += 1
      if (message.senderEmail.trim().toLowerCase() === adapter.mailboxAddress.trim().toLowerCase() || isAutomaticMessage(message)) {
        result.ignored += 1
        continue
      }
      const status = await ingestReply(officeId, message, candidates)
      if (status === 'matched') result.matched += 1
      else if (status === 'needs_review') result.needsReview += 1
      else if (status === 'unmatched') result.unmatched += 1
      else result.duplicates += 1
    }
    await prisma.recibosReplySyncCheckpoint.update({
      where: { id: checkpoint.id },
      data: {
        graphDeltaLink: polled.checkpoint.graphDeltaLink ?? checkpoint.graphDeltaLink,
        gmailUidValidity: polled.checkpoint.gmailUidValidity ?? checkpoint.gmailUidValidity,
        gmailLastUid: polled.checkpoint.gmailLastUid ?? checkpoint.gmailLastUid,
        lastSuccessfulAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    })
    await recordProviderSuccess({ officeId, provider: adapter.provider, mailboxAddress: adapter.mailboxAddress, kind: 'sync' })
    return result
  } catch (error) {
    const message = sanitizeDispatchError(error)
    await prisma.recibosReplySyncCheckpoint.update({ where: { id: checkpoint.id }, data: { lockedAt: null, lastError: message } })
    return { ...result, error: message }
  }
}

export async function syncOfficeReplies(params: { officeId: number; userId?: string; requestId?: string; adapters?: ReplyProviderAdapter[] }) {
  const adapters = params.adapters ?? enabledReplyProviders()
  const candidates = await dispatchCandidates(params.officeId)
  const results: ProviderSyncResult[] = []
  for (const adapter of adapters) results.push(await syncProvider(params.officeId, adapter, candidates))
  const totals = results.reduce((sum, item) => ({
    checked: sum.checked + item.checked,
    matched: sum.matched + item.matched,
    unmatched: sum.unmatched + item.unmatched,
    needsReview: sum.needsReview + item.needsReview,
    duplicates: sum.duplicates + item.duplicates,
    ignored: sum.ignored + item.ignored,
    failedProviders: sum.failedProviders + (item.error ? 1 : 0),
  }), { checked: 0, matched: 0, unmatched: 0, needsReview: 0, duplicates: 0, ignored: 0, failedProviders: 0 })
  if (params.userId) {
    await recordOperationalActivity({
      userId: params.userId,
      officeId: params.officeId,
      requestId: params.requestId,
      eventType: 'receipt_reply_sync',
      count: totals.checked,
      details: { ...totals, providers: results.map(item => item.provider) } satisfies Prisma.JsonObject,
    })
  } else {
    await recordBestEffortEvent({ officeId: params.officeId, requestId: params.requestId, actorType: 'SYSTEM', source: 'SYSTEM' }, {
      eventType: 'receipt.reply_sync', module: 'emails',
      result: totals.failedProviders > 0 ? 'failure' : 'success',
      recordType: 'RecibosReplySync', description: 'Sincronizacion de respuestas de recibos registrada.',
      metadata: { ...totals, providers: results.map(item => item.provider) },
    })
  }
  return { providers: results, totals }
}

export async function syncAllConfiguredOfficeReplies(requestId?: string) {
  const offices = await prisma.recibosDispatchBatch.findMany({
    where: { provider: { not: 'dry-run' }, status: { in: ['sent', 'partial'] } },
    distinct: ['officeId'],
    select: { officeId: true },
  })
  const results = []
  for (const office of offices) results.push({ officeId: office.officeId, result: await syncOfficeReplies({ officeId: office.officeId, requestId }) })
  return results
}

export async function listUnmatchedReplies(input: {
  officeId: number
  page?: number
  limit?: number
  status?: UnmatchedReplyStatusFilter
}) {
  const page = Math.max(1, Math.trunc(input.page ?? 1))
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 25)))
  const status = input.status ?? 'all'
  const where: Prisma.RecibosDispatchReplyWhereInput = {
    officeId: input.officeId,
    matchStatus: { in: unmatchedReplyStatuses(status) },
  }
  const [items, total] = await prisma.$transaction([
    prisma.recibosDispatchReply.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        provider: true,
        mailboxAddress: true,
        senderEmail: true,
        subject: true,
        textPreview: true,
        receivedAt: true,
        matchStatus: true,
        matchMethod: true,
        candidateRecipientIds: true,
      },
    }),
    prisma.recibosDispatchReply.count({ where }),
  ])
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}
