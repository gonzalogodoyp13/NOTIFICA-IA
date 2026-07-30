import 'server-only'

import { Prisma } from '@prisma/client'
import { Buffer } from 'buffer'

import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api/server'
import { recordOperationalActivity } from '@/lib/audit/operationalActivity'
import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { getReceiptList, type ReceiptListRow } from '@/lib/recibos/query'
import { buildRecibosWorkbook } from '@/lib/recibos/xlsx'
import { createMailAdapter, sendWithRetries, type MailAdapter } from '@/lib/recibos/mailer'
import { buildSendPreview, isValidEmail, type ReceiptRecipientType, type SendPreview } from '@/lib/recibos/send-core'
import { loadSmartRecibosTemplate, officeNameForTemplate } from '@/lib/recibos/email-template'
import { renderSmartRecibosTemplate } from '@/lib/recibos/email-template-core'
import { finalBatchStatus, sanitizeDispatchError, sha256Hex } from '@/lib/recibos/dispatch-history-core'
import { createTrackingToken, subjectWithTrackingToken } from '@/lib/recibos/reply-tracking-core'
import { duplicateIntelligenceForGroup, enrichSendPreview } from '@/lib/recibos/smart-control'
import { recordProviderSuccess } from '@/lib/recibos/provider-health'
import type { ReceiptSendInput, ReceiptSendPreviewInput, ReceiptTestSendInput } from '@/lib/validations/recibos'

type UserContext = { id: string; officeId: number; requestId?: string; actorType?: 'USER'; source?: 'WEB' }

function selectionOptions(selection: ReceiptSendPreviewInput['selection']) {
  return selection.mode === 'explicit'
    ? { reciboIds: Array.from(new Set(selection.reciboIds)) }
    : { excludedIds: Array.from(new Set(selection.excludedIds)) }
}

async function loadSelectedRows(user: UserContext, input: ReceiptSendPreviewInput) {
  const result = await getReceiptList(user.officeId, input.filters, {
    exportAll: true,
    ...selectionOptions(input.selection),
  })
  if (!result.rows.length) throw new Error('No hay recibos seleccionados para enviar.')
  return result.rows
}

function renderPreviewGroups(params: {
  preview: SendPreview
  subject: string
  body: string
  officeName: string
}) {
  return params.preview.groups.map(group => ({
    ...group,
    ...renderSmartRecibosTemplate({
      subject: params.subject,
      body: params.body,
      group,
      officeName: params.officeName,
    }),
  }))
}

export async function buildReceiptSendPreview(user: UserContext, input: ReceiptSendPreviewInput) {
  const [rows, savedTemplate, officeName] = await Promise.all([
    loadSelectedRows(user, input),
    loadSmartRecibosTemplate(user.officeId),
    officeNameForTemplate(user.officeId),
  ])
  const template = input.template
    ? { ...savedTemplate, subject: input.template.subject, body: input.template.body, unknownVariables: [] }
    : savedTemplate
  const preview = buildSendPreview({ rows, filters: input.filters, recipientMode: input.recipientMode })
  const renderedGroups = renderPreviewGroups({ preview, subject: template.subject, body: template.body, officeName })
  const smart = await enrichSendPreview(user.officeId, renderedGroups)
  const unknownVariables = Array.from(new Set([
    ...template.unknownVariables,
    ...renderedGroups.flatMap(group => group.unknownVariables),
  ]))
  return {
    ...preview,
    template: { ...template, unknownVariables },
    groups: smart.groups,
    cleanupSuggestions: smart.cleanupSuggestions,
  }
}

function recipientSummary(groupRecipientName: string) {
  return `Listado de recibos para ${groupRecipientName}`
}

function rowsByGroup(rows: ReceiptListRow[], preview: SendPreview) {
  const rowMap = new Map(rows.map(row => [row.reciboId, row]))
  return new Map(preview.groups.map(group => [
    group.groupKey,
    group.reciboIds.map(id => rowMap.get(id)).filter((row): row is ReceiptListRow => !!row),
  ]))
}

function snapshotDate(value: string | null) {
  return value ? new Date(value) : null
}

function recipientEmailsJson(emails: string[]) {
  return emails satisfies Prisma.JsonArray
}

function mergedRecipient(params: {
  original: { recipientType: ReceiptRecipientType; recipientId: number; email: string | null }
  submitted?: { email: string; saveToRecord: boolean }
}) {
  const email = params.submitted?.email.trim() || params.original.email?.trim() || ''
  return {
    ...params.original,
    email,
    saveToRecord: params.submitted?.saveToRecord ?? false,
    validEmail: isValidEmail(email),
  }
}

async function saveRecipientEmails(officeId: number, recipients: Array<ReturnType<typeof mergedRecipient>>) {
  for (const recipient of recipients) {
    if (!recipient.saveToRecord || !recipient.validEmail) continue
    if (recipient.recipientType === 'abogado') {
      await prisma.abogado.updateMany({
        where: { id: recipient.recipientId, officeId },
        data: { email: recipient.email },
      })
    } else {
      await prisma.procurador.updateMany({
        where: { id: recipient.recipientId, officeId },
        data: { email: recipient.email },
      })
    }
  }
}

export async function sendReceiptGroups(params: {
  user: UserContext
  input: ReceiptSendInput
  adapter?: MailAdapter
}) {
  const rows = await loadSelectedRows(params.user, params.input)
  const [savedTemplate, officeName] = await Promise.all([
    loadSmartRecibosTemplate(params.user.officeId),
    officeNameForTemplate(params.user.officeId),
  ])
  const templateMode = savedTemplate.subject === params.input.template.subject && savedTemplate.body === params.input.template.body
    ? 'default'
    : 'custom'
  const preview = buildSendPreview({ rows, filters: params.input.filters, recipientMode: params.input.recipientMode })
  const renderedGroups = new Map(renderPreviewGroups({
    preview,
    subject: params.input.template.subject,
    body: params.input.template.body,
    officeName,
  }).map(group => [group.groupKey, group]))
  const rowsForGroup = rowsByGroup(rows, preview)
  const submitted = new Map(params.input.groups.map(group => [group.groupKey, group]))
  const adapter = params.adapter ?? createMailAdapter()
  const sent: Array<{ groupKey: string; messageId: string; attempts: number; provider: string; threadId?: string | null }> = []
  const dispatchRecipients = new Map<string, string>()
  const dispatchSubjects = new Map<string, string>()
  let failedGroup: string | null = null
  let activeGroup: string | null = null
  let activeDispatchRecipientId: string | null = null

  const sendJobs = preview.groups.flatMap(group => {
    const groupInput = submitted.get(group.groupKey)
    if (!groupInput) return []
    const inputRecipients = new Map(groupInput.recipients.map(recipient => [`${recipient.recipientType}:${recipient.recipientId}`, recipient]))
    const recipients = group.recipients.map(recipient => mergedRecipient({
      original: recipient,
      submitted: inputRecipients.get(`${recipient.recipientType}:${recipient.recipientId}`),
    }))
    const to = Array.from(new Set(recipients.filter(recipient => recipient.validEmail).map(recipient => recipient.email)))
    if (!to.length) return []
    return [{ group, recipients, to }]
  })
  const duplicateByGroup = new Map<string, Awaited<ReturnType<typeof duplicateIntelligenceForGroup>>>()
  for (const job of sendJobs) {
    const intelligence = await duplicateIntelligenceForGroup(params.user.officeId, job.group)
    duplicateByGroup.set(job.group.groupKey, intelligence)
    const confirmation = submitted.get(job.group.groupKey)?.duplicateConfirmation
    if (intelligence.requiresConfirmation && (!confirmation?.confirmed || confirmation.reason.trim().length < 3)) {
      throw new ApiError('CONFLICT', intelligence.warning || 'Este listado incluye recibos enviados recientemente. Confirma el reenvio e indica un motivo.', 409)
    }
  }

  const batch = await prisma.recibosDispatchBatch.create({
    data: {
      officeId: params.user.officeId,
      userId: params.user.id,
      recipientMode: params.input.recipientMode,
      provider: adapter.provider,
      fromAccount: adapter.fromAccount,
      status: 'prepared',
      selectedCount: rows.length,
      excludedCount: preview.totals.excludedRows,
      groupCount: preview.groups.length,
      templateMode,
    },
  })

  for (const job of sendJobs) {
    const rendered = renderedGroups.get(job.group.groupKey)
    const workbookRows = rowsForGroup.get(job.group.groupKey) ?? []
    const trackingToken = createTrackingToken()
    const subject = subjectWithTrackingToken(rendered?.subject ?? params.input.template.subject, trackingToken)
    const duplicate = duplicateByGroup.get(job.group.groupKey)
    const confirmation = submitted.get(job.group.groupKey)?.duplicateConfirmation
    const recipient = await prisma.recibosDispatchRecipient.create({
      data: {
        batchId: batch.id,
        groupKey: job.group.groupKey,
        recipientType: job.group.recipientType,
        recipientName: job.group.recipientName,
        recipientEmails: recipientEmailsJson(job.to),
        subject,
        body: rendered?.body ?? params.input.template.body,
        status: 'prepared',
        trackingToken,
        duplicateOverrideReason: duplicate?.requiresConfirmation ? confirmation?.reason : null,
        duplicateConfirmedByUserId: duplicate?.requiresConfirmation ? params.user.id : null,
        duplicateConfirmedAt: duplicate?.requiresConfirmation ? new Date() : null,
        overlappingDispatchIds: duplicate?.overlappingDispatchIds ?? [],
        reciboCount: job.group.reciboCount,
        totalAmount: job.group.totalAmount,
        warningSummary: job.group.warnings satisfies Prisma.JsonArray,
        items: {
          create: workbookRows.map(row => ({
            reciboId: row.reciboId,
            numeroRecibo: row.numeroRecibo,
            rol: row.rol,
            monto: row.valor,
            fechaEjecucion: snapshotDate(row.fechaEjecucion),
          })),
        },
      },
    })
    dispatchRecipients.set(job.group.groupKey, recipient.id)
    dispatchSubjects.set(job.group.groupKey, subject)
  }

  await prisma.recibosDispatchBatch.update({
    where: { id: batch.id },
    data: { status: 'sending' },
  })
  try {
    for (const job of sendJobs) {
      activeGroup = job.group.groupKey
      activeDispatchRecipientId = dispatchRecipients.get(job.group.groupKey) ?? null
      if (activeDispatchRecipientId) {
        await prisma.recibosDispatchRecipient.update({
          where: { id: activeDispatchRecipientId },
          data: { status: 'sending' },
        })
      }

      await saveRecipientEmails(params.user.officeId, job.recipients)
      const workbookRows = rowsForGroup.get(job.group.groupKey) ?? []
      const workbook = await buildRecibosWorkbook(workbookRows, recipientSummary(job.group.recipientName))
      const attachment = Buffer.from(workbook)
      const result = await sendWithRetries(adapter, {
        to: job.to,
        subject: dispatchSubjects.get(job.group.groupKey) ?? params.input.template.subject,
        text: renderedGroups.get(job.group.groupKey)?.body ?? params.input.template.body,
        attachments: [{
          filename: job.group.attachmentFilename,
          content: attachment,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }],
      }, 3)
      if (activeDispatchRecipientId) {
        await prisma.recibosDispatchRecipient.update({
          where: { id: activeDispatchRecipientId },
          data: {
            status: 'sent',
            attemptCount: result.attempts,
            providerMessageId: result.messageId,
            providerThreadId: result.threadId ?? null,
            providerInternetMessageId: result.internetMessageId ?? null,
            attachmentFilename: job.group.attachmentFilename,
            attachmentMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            attachmentByteSize: attachment.byteLength,
            attachmentSha256: sha256Hex(attachment),
            sentAt: new Date(),
            completedAt: new Date(),
          },
        })
      }
      sent.push({ groupKey: job.group.groupKey, messageId: result.messageId, attempts: result.attempts, provider: result.provider, threadId: result.threadId })
      activeGroup = null
      activeDispatchRecipientId = null
    }
  } catch (error) {
    failedGroup = activeGroup
    const errorMessage = sanitizeDispatchError(error)
    if (activeDispatchRecipientId) {
      await prisma.recibosDispatchRecipient.update({
        where: { id: activeDispatchRecipientId },
        data: {
          status: 'failed',
          attemptCount: 3,
          errorMessage,
          completedAt: new Date(),
        },
      })
    }
    await prisma.recibosDispatchRecipient.updateMany({
      where: { batchId: batch.id, status: 'prepared' },
      data: { status: 'skipped', completedAt: new Date() },
    })
    const [sentCount, failedCount, skippedCount] = await Promise.all([
      prisma.recibosDispatchRecipient.count({ where: { batchId: batch.id, status: 'sent' } }),
      prisma.recibosDispatchRecipient.count({ where: { batchId: batch.id, status: 'failed' } }),
      prisma.recibosDispatchRecipient.count({ where: { batchId: batch.id, status: 'skipped' } }),
    ])
    const status = finalBatchStatus({ sent: sentCount, failed: failedCount })
    await prisma.recibosDispatchBatch.update({
      where: { id: batch.id },
      data: {
        status,
        sentCount,
        failedCount,
        skippedCount,
        errorMessage,
        sentAt: sentCount > 0 ? new Date() : null,
        completedAt: new Date(),
      },
    })
    await recordOperationalActivity({
      userId: params.user.id,
      officeId: params.user.officeId,
      eventType: 'receipt_send',
      count: rows.length,
      details: {
        provider: adapter.provider,
        recipientMode: params.input.recipientMode,
        groupCount: preview.groups.length,
        sentCount: sent.length,
        failedGroup,
        skippedCount,
        status,
        templateMode,
        dispatchBatchId: batch.id,
      } satisfies Prisma.JsonObject,
    })
    throw error
  }

  const [sentCount, failedCount, skippedCount] = await Promise.all([
    prisma.recibosDispatchRecipient.count({ where: { batchId: batch.id, status: 'sent' } }),
    prisma.recibosDispatchRecipient.count({ where: { batchId: batch.id, status: 'failed' } }),
    prisma.recibosDispatchRecipient.count({ where: { batchId: batch.id, status: 'skipped' } }),
  ])
  const status = finalBatchStatus({ sent: sentCount, failed: failedCount })
  const duplicateOverrideCount = Array.from(duplicateByGroup.values()).filter(item => item.requiresConfirmation).length
  await prisma.$transaction(async tx => {
    await tx.recibosDispatchBatch.update({
      where: { id: batch.id },
      data: { status, sentCount, failedCount, skippedCount, sentAt: sentCount > 0 ? new Date() : null, completedAt: new Date() },
    })
    await enqueueExternalEvent(tx, params.user, {
      eventType: 'receipt.send', module: 'emails', result: 'success',
      recordType: 'RecibosDispatchBatch', recordId: batch.id,
      description: 'Envio de recibos registrado.',
      deduplicationKey: `receipt-send:${batch.id}:completed`,
      metadata: {
        dispatchBatchId: batch.id, count: rows.length, groupCount: preview.groups.length,
        sentCount, failedCount, skippedCount, status, provider: adapter.provider, duplicateOverrideCount,
      },
    })
  })
  await processActivityOutbox(50).catch(() => undefined)
  if (sentCount > 0) await recordProviderSuccess({ officeId: params.user.officeId, provider: adapter.provider, mailboxAddress: adapter.fromAccount, kind: 'send' })
  return {
    dispatchBatchId: batch.id,
    provider: adapter.provider,
    selectedRows: rows.length,
    groupCount: preview.groups.length,
    sentCount,
    sent,
  }
}

export async function sendReceiptTest(params: { user: UserContext & { email: string }; input: ReceiptTestSendInput; adapter?: MailAdapter }) {
  const rows = await loadSelectedRows(params.user, params.input)
  const officeName = await officeNameForTemplate(params.user.officeId)
  const preview = buildSendPreview({ rows, filters: params.input.filters, recipientMode: params.input.recipientMode })
  const group = preview.groups.find(item => item.groupKey === params.input.groupKey)
  if (!group) throw new ApiError('NOT_FOUND', 'El grupo seleccionado ya no esta disponible.', 404)
  const rendered = renderSmartRecibosTemplate({ subject: params.input.template.subject, body: params.input.template.body, group, officeName })
  const workbookRows = rowsByGroup(rows, preview).get(group.groupKey) ?? []
  const workbook = Buffer.from(await buildRecibosWorkbook(workbookRows, recipientSummary(group.recipientName)))
  const adapter = params.adapter ?? createMailAdapter()
  const batch = await prisma.recibosDispatchBatch.create({ data: { officeId: params.user.officeId, userId: params.user.id, recipientMode: params.input.recipientMode, provider: adapter.provider, fromAccount: adapter.fromAccount, status: 'sending', selectedCount: workbookRows.length, groupCount: 1, templateMode: 'custom', dispatchKind: 'test' } })
  const recipient = await prisma.recibosDispatchRecipient.create({ data: {
    batchId: batch.id, groupKey: `test:${group.groupKey}`, recipientType: 'Prueba', recipientName: params.user.email,
    recipientEmails: [params.user.email], subject: `[PRUEBA] ${rendered.subject}`, body: rendered.body, status: 'sending',
    reciboCount: workbookRows.length, totalAmount: workbookRows.reduce((sum, row) => sum + row.valor, 0),
    items: { create: workbookRows.map(row => ({ reciboId: row.reciboId, numeroRecibo: row.numeroRecibo, rol: row.rol, monto: row.valor, fechaEjecucion: snapshotDate(row.fechaEjecucion) })) },
  } })
  try {
    const result = await sendWithRetries(adapter, { to: [params.user.email], subject: `[PRUEBA] ${rendered.subject}`, text: rendered.body, attachments: [{ filename: group.attachmentFilename, content: workbook, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }] }, 3)
    const now = new Date()
    await prisma.$transaction(async tx => {
      await tx.recibosDispatchRecipient.update({ where: { id: recipient.id }, data: { status: 'sent', attemptCount: result.attempts, providerMessageId: result.messageId, providerThreadId: result.threadId ?? null, providerInternetMessageId: result.internetMessageId ?? null, attachmentFilename: group.attachmentFilename, attachmentMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', attachmentByteSize: workbook.byteLength, attachmentSha256: sha256Hex(workbook), sentAt: now, completedAt: now } })
      await tx.recibosDispatchBatch.update({ where: { id: batch.id }, data: { status: 'sent', sentCount: 1, sentAt: now, completedAt: now } })
      await enqueueExternalEvent(tx, params.user, {
        eventType: 'receipt.test_send', module: 'emails', result: 'success',
        recordType: 'RecibosDispatchBatch', recordId: batch.id,
        description: 'Envio de prueba de recibos registrado.',
        deduplicationKey: `receipt-test-send:${batch.id}:completed`,
        metadata: { dispatchBatchId: batch.id, recipientId: recipient.id, count: workbookRows.length, provider: adapter.provider },
      })
    })
    await processActivityOutbox(50).catch(() => undefined)
    return { dispatchBatchId: batch.id, recipientId: recipient.id, provider: adapter.provider, sentCount: 1 }
  } catch (error) {
    const message = sanitizeDispatchError(error)
    await prisma.$transaction([
      prisma.recibosDispatchRecipient.update({ where: { id: recipient.id }, data: { status: 'failed', attemptCount: 3, errorMessage: message, completedAt: new Date() } }),
      prisma.recibosDispatchBatch.update({ where: { id: batch.id }, data: { status: 'failed', failedCount: 1, errorMessage: message, completedAt: new Date() } }),
    ])
    throw error
  }
}
