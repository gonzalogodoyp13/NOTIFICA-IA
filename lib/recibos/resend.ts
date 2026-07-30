import 'server-only'

import { Buffer } from 'buffer'

import { ApiError } from '@/lib/api/server'
import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { prisma } from '@/lib/prisma'
import { sha256Hex, sanitizeDispatchError } from '@/lib/recibos/dispatch-history-core'
import { createMailAdapter, sendWithRetries } from '@/lib/recibos/mailer'
import { recordProviderSuccess } from '@/lib/recibos/provider-health'
import { getReceiptList } from '@/lib/recibos/query'
import { createTrackingToken, subjectWithTrackingToken } from '@/lib/recibos/reply-tracking-core'
import { duplicateIntelligenceForGroup } from '@/lib/recibos/smart-control'
import { buildRecibosWorkbook } from '@/lib/recibos/xlsx'
import type { z } from 'zod'
import { DispatchResendSchema } from '@/lib/validations/recibos'

type Input = z.infer<typeof DispatchResendSchema>
const emptyFilters = { abogadoIds: [], procuradorIds: [], bancoIds: [], estados: [], estampoTemplates: [], boletaMatch: 'contains' as const, page: 1, pageSize: 25 }

export async function resendDispatch(params: { officeId: number; userId: string; requestId?: string; recipientId: string; input: Input }) {
  const source = await prisma.recibosDispatchRecipient.findFirst({ where: { id: params.recipientId, batch: { officeId: params.officeId } }, include: { batch: true, items: true } })
  if (!source) throw new ApiError('NOT_FOUND', 'El envio original no existe.', 404)
  const originalIds = source.items.map(item => item.reciboId)
  const current = await getReceiptList(params.officeId, emptyFilters, { exportAll: true, reciboIds: originalIds })
  const unavailableCount = originalIds.length - current.rows.length
  if (!current.rows.length) throw new ApiError('CONFLICT', 'Ninguno de los recibos del envio original sigue disponible.', 409)
  if (unavailableCount > 0 && !params.input.confirmPartial) throw new ApiError('CONFLICT', `${unavailableCount} recibo(s) ya no estan disponibles. Confirma el reenvio parcial.`, 409)
  const intelligence = await duplicateIntelligenceForGroup(params.officeId, { groupKey: source.groupKey.replace(/^test:/, ''), reciboIds: current.rows.map(row => row.reciboId) })
  if (intelligence.requiresConfirmation && !params.input.duplicateConfirmation) throw new ApiError('CONFLICT', intelligence.warning || 'Confirma el reenvio duplicado.', 409)
  const adapter = createMailAdapter()
  const workbook = Buffer.from(await buildRecibosWorkbook(current.rows, `Reenvio de listado para ${source.recipientName}`))
  const token = createTrackingToken()
  const baseSubject = params.input.subject.replace(/\s*\[NIA-[A-Z0-9]{8,24}\]\s*$/i, '').trim()
  const subject = subjectWithTrackingToken(baseSubject, token)
  const batch = await prisma.recibosDispatchBatch.create({ data: { officeId: params.officeId, userId: params.userId, recipientMode: source.batch.recipientMode, provider: adapter.provider, fromAccount: adapter.fromAccount, status: 'sending', selectedCount: current.rows.length, excludedCount: unavailableCount, groupCount: 1, templateMode: source.batch.templateMode, dispatchKind: 'resend' } })
  const recipient = await prisma.recibosDispatchRecipient.create({ data: {
    batchId: batch.id, groupKey: source.groupKey.replace(/^test:/, ''), recipientType: source.recipientType, recipientName: source.recipientName,
    recipientEmails: params.input.emails, subject, body: params.input.body, status: 'sending', trackingToken: token,
    reciboCount: current.rows.length, totalAmount: current.rows.reduce((sum, row) => sum + row.valor, 0), resendOfRecipientId: source.id,
    resendReason: params.input.reason, partialResendConfirmed: unavailableCount > 0,
    duplicateOverrideReason: intelligence.requiresConfirmation ? params.input.duplicateConfirmation?.reason : null,
    duplicateConfirmedByUserId: intelligence.requiresConfirmation ? params.userId : null,
    duplicateConfirmedAt: intelligence.requiresConfirmation ? new Date() : null,
    overlappingDispatchIds: intelligence.overlappingDispatchIds,
    items: { create: current.rows.map(row => ({ reciboId: row.reciboId, numeroRecibo: row.numeroRecibo, rol: row.rol, monto: row.valor, fechaEjecucion: row.fechaEjecucion ? new Date(row.fechaEjecucion) : null })) },
  } })
  try {
    const result = await sendWithRetries(adapter, { to: params.input.emails, subject, text: params.input.body, attachments: [{ filename: source.attachmentFilename || 'Listado-Diligencias-reenvio.xlsx', content: workbook, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }] }, 3)
    const now = new Date()
    await prisma.$transaction(async tx => {
      await tx.recibosDispatchRecipient.update({ where: { id: recipient.id }, data: { status: 'sent', attemptCount: result.attempts, providerMessageId: result.messageId, providerThreadId: result.threadId ?? null, providerInternetMessageId: result.internetMessageId ?? null, attachmentFilename: source.attachmentFilename || 'Listado-Diligencias-reenvio.xlsx', attachmentMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', attachmentByteSize: workbook.byteLength, attachmentSha256: sha256Hex(workbook), sentAt: now, completedAt: now } })
      await tx.recibosDispatchBatch.update({ where: { id: batch.id }, data: { status: 'sent', sentCount: 1, sentAt: now, completedAt: now } })
      await enqueueExternalEvent(tx, { id: params.userId, officeId: params.officeId, requestId: params.requestId }, {
        eventType: 'receipt.resend', module: 'emails', result: 'success',
        recordType: 'RecibosDispatchBatch', recordId: batch.id,
        description: 'Reenvio de recibos registrado.',
        deduplicationKey: `receipt-resend:${batch.id}:completed`,
        metadata: { sourceRecipientId: source.id, recipientId: recipient.id, batchId: batch.id, count: current.rows.length, unavailableCount },
      })
    })
    await processActivityOutbox(50).catch(() => undefined)
    await recordProviderSuccess({ officeId: params.officeId, provider: adapter.provider, mailboxAddress: adapter.fromAccount, kind: 'send' })
    return { batchId: batch.id, recipientId: recipient.id, unavailableCount, provider: adapter.provider }
  } catch (error) {
    const message = sanitizeDispatchError(error)
    await prisma.$transaction([
      prisma.recibosDispatchRecipient.update({ where: { id: recipient.id }, data: { status: 'failed', attemptCount: 3, errorMessage: message, completedAt: new Date() } }),
      prisma.recibosDispatchBatch.update({ where: { id: batch.id }, data: { status: 'failed', failedCount: 1, errorMessage: message, completedAt: new Date() } }),
    ])
    throw error
  }
}
