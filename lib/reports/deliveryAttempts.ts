import 'server-only'

import {
  Prisma,
  ReportDeliveryAttemptMode,
  ReportDeliveryAttemptStatus,
  ReportDeliveryRecipientStatus,
  ReportDeliveryTarget,
  ReportRecipientAuthorization,
  type GeneratedReport,
} from '@prisma/client'

import { ApiError } from '@/lib/api/server'
import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { prisma } from '@/lib/prisma'
import { sendWithRetries, type MailAdapter } from '@/lib/recibos/mailer'
import { chooseAuditReportAttachment, sanitizeDeliveryError } from './dailyDeliveryCore'
import { downloadVerifiedReportVersion } from './versioning'
import { finalDeliveryAttemptStatus, isValidReportIdempotencyKey } from './reportSafetyCore'
import { configuredRecipients } from './recipients'

export type DeliveryMode = 'manual' | 'scheduled'
export type DeliveryTarget = 'all' | 'failed'

export function validateReportIdempotencyKey(value: string | null | undefined) {
  const key = value?.trim() ?? ''
  if (!isValidReportIdempotencyKey(key)) {
    throw new ApiError('VALIDATION_ERROR', 'El encabezado Idempotency-Key es obligatorio y no es valido.', 400)
  }
  return key
}

export function scheduledReportIdempotencyKey(input: { officeId: number; reportType: string; periodDate: string }) {
  return `scheduled:${input.officeId}:${input.reportType}:${input.periodDate}:all`
}

function resultFromAttempt(attempt: {
  id: string
  attemptNumber: number
  reportId: string | null
  reportVersionId: string | null
  status: ReportDeliveryAttemptStatus
  intendedRecipientCount: number
  sentCount: number
  failedCount: number
  skippedCount: number
}) {
  return {
    status: attempt.status.toLowerCase(),
    reportId: attempt.reportId!,
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    reportVersionId: attempt.reportVersionId!,
    sentCount: attempt.sentCount,
    failedCount: attempt.failedCount,
    skippedCount: attempt.skippedCount,
    intendedRecipientCount: attempt.intendedRecipientCount,
  }
}

export async function executeReportDelivery(input: {
  officeId: number
  userId?: string | null
  requestId?: string
  mode: DeliveryMode
  target: DeliveryTarget
  previousAttemptId?: string | null
  idempotencyKey: string
  report: GeneratedReport
  adapter: MailAdapter
  email: { subject: string; text: string }
  shouldCancel?: () => Promise<boolean>
  onProgress?: (completed: number, total: number, phase: string) => Promise<void>
}) {
  const key = validateReportIdempotencyKey(input.idempotencyKey)
  const mode = input.mode === 'scheduled' ? ReportDeliveryAttemptMode.SCHEDULED : ReportDeliveryAttemptMode.MANUAL
  const target = input.target === 'failed' ? ReportDeliveryTarget.FAILED_ONLY : ReportDeliveryTarget.ALL_AUTHORIZED
  const normalizedParentAttemptId = target === ReportDeliveryTarget.FAILED_ONLY ? input.previousAttemptId ?? null : null

  const existing = await prisma.reportDeliveryAttempt.findUnique({
    where: { officeId_idempotencyKey: { officeId: input.officeId, idempotencyKey: key } },
  })
  if (existing) {
    if (existing.reportId !== input.report.id || existing.target !== target || existing.parentAttemptId !== normalizedParentAttemptId) {
      throw new ApiError('IDEMPOTENCY_KEY_REUSED', 'La clave de idempotencia ya fue usada para otra accion.', 409)
    }
    return resultFromAttempt(existing)
  }

  const parent = target === ReportDeliveryTarget.FAILED_ONLY
    ? await prisma.reportDeliveryAttempt.findFirst({
      where: { id: normalizedParentAttemptId ?? '', officeId: input.officeId, reportId: input.report.id },
      include: { recipients: { where: { status: ReportDeliveryRecipientStatus.FAILED }, orderBy: { email: 'asc' } } },
    })
    : null
  if (target === ReportDeliveryTarget.FAILED_ONLY && !parent) {
    throw new ApiError('VALIDATION_ERROR', 'Retry failed requiere un intento anterior valido.', 400)
  }

  const pinnedVersionId = parent?.reportVersionId ?? input.report.currentVersionId
  if (!pinnedVersionId) throw new ApiError('CONFLICT', 'El reporte no tiene una version disponible para enviar.', 409)
  const pinnedVersion = await prisma.generatedReportVersion.findFirst({
    where: { id: pinnedVersionId, reportId: input.report.id },
    select: { id: true, checksumSha256: true },
  })
  if (!pinnedVersion?.checksumSha256) throw new ApiError('CONFLICT', 'La version fijada no tiene metadatos de integridad.', 409)

  const snapshots: Array<{
    userId: string
    email: string
    authorizationDecision: ReportRecipientAuthorization
    status: ReportDeliveryRecipientStatus
    completedAt?: Date
    errorMessage?: string
  }> = []
  if (target === ReportDeliveryTarget.ALL_AUTHORIZED) {
    const users = await configuredRecipients({
      officeId: input.officeId,
      kind: input.report.reportType === 'monthly' ? 'monthly' : input.report.reportType === 'custom' ? 'custom' : 'daily',
      definitionId: input.report.customDefinitionId,
    })
    snapshots.push(...users.map(user => ({
      userId: user.id,
      email: user.email,
      authorizationDecision: ReportRecipientAuthorization.AUTHORIZED,
      status: ReportDeliveryRecipientStatus.PREPARED,
    })))
  } else {
    const failedRecipients = parent!.recipients
    const users = await configuredRecipients({
      officeId: input.officeId,
      kind: input.report.reportType === 'monthly' ? 'monthly' : input.report.reportType === 'custom' ? 'custom' : 'daily',
      definitionId: input.report.customDefinitionId,
      userIds: failedRecipients.map(recipient => recipient.userId),
    })
    const usersById = new Map(users.map(user => [user.id, user]))
    for (const recipient of failedRecipients) {
      const user = usersById.get(recipient.userId)
      const authorized = !!user
      snapshots.push({
        userId: recipient.userId,
        email: user?.email ?? recipient.email,
        authorizationDecision: authorized ? ReportRecipientAuthorization.AUTHORIZED : ReportRecipientAuthorization.REVOKED,
        status: authorized ? ReportDeliveryRecipientStatus.PREPARED : ReportDeliveryRecipientStatus.SKIPPED,
        ...(authorized ? {} : { completedAt: new Date(), errorMessage: 'El destinatario ya no es un administrador activo de la oficina.' }),
      })
    }
  }

  const authorizedCount = snapshots.filter(item => item.authorizationDecision === ReportRecipientAuthorization.AUTHORIZED).length
  const skippedCount = snapshots.length - authorizedCount
  const created = await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "generated_reports" WHERE "id" = ${input.report.id} FOR UPDATE`)
    const duplicate = await tx.reportDeliveryAttempt.findUnique({
      where: { officeId_idempotencyKey: { officeId: input.officeId, idempotencyKey: key } },
    })
    if (duplicate) return { attempt: duplicate, created: false }
    const last = await tx.reportDeliveryAttempt.findFirst({
      where: { reportId: input.report.id },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    })
    const attempt = await tx.reportDeliveryAttempt.create({
      data: {
        officeId: input.officeId,
        reportId: input.report.id,
        reportVersionId: pinnedVersion.id,
        attemptNumber: (last?.attemptNumber ?? 0) + 1,
        mode,
        target,
        parentAttemptId: parent?.id ?? null,
        idempotencyKey: key,
        requestedByUserId: input.userId ?? null,
        provider: input.adapter.provider,
        fromAccount: input.adapter.fromAccount,
        intendedRecipientCount: authorizedCount,
        skippedCount,
        status: authorizedCount ? ReportDeliveryAttemptStatus.PENDING : ReportDeliveryAttemptStatus.NO_RECIPIENTS,
        startedAt: new Date(),
        completedAt: authorizedCount ? null : new Date(),
        recipients: { create: snapshots },
      },
    })
    return { attempt, created: true }
  })
  if (!created.created) return resultFromAttempt(created.attempt)

  let preparationError: string | null = null
  let attachment: ReturnType<typeof chooseAuditReportAttachment> | null = null
  let cancelled = false

  if (authorizedCount) {
    await prisma.reportDeliveryAttempt.update({ where: { id: created.attempt.id }, data: { status: ReportDeliveryAttemptStatus.SENDING } })
    try {
      const downloaded = await downloadVerifiedReportVersion({
        officeId: input.officeId,
        reportId: input.report.id,
        versionId: pinnedVersion.id,
      })
      attachment = chooseAuditReportAttachment({
        buffer: downloaded.buffer,
        fileName: downloaded.version.fileName,
        modifiedAt: downloaded.version.generatedAt,
      })
      await prisma.reportDeliveryAttemptRecipient.updateMany({
        where: { attemptId: created.attempt.id },
        data: {
          attachmentFilename: attachment.filename,
          attachmentMimeType: attachment.contentType,
          attachmentByteSize: attachment.content.byteLength,
          attachmentSha256: attachment.checksumSha256,
        },
      })
    } catch (error) {
      preparationError = sanitizeDeliveryError(error)
      await prisma.reportDeliveryAttemptRecipient.updateMany({
        where: {
          attemptId: created.attempt.id,
          authorizationDecision: ReportRecipientAuthorization.AUTHORIZED,
        },
        data: {
          status: ReportDeliveryRecipientStatus.FAILED,
          errorMessage: preparationError,
          completedAt: new Date(),
        },
      })
    }
    const recipients = await prisma.reportDeliveryAttemptRecipient.findMany({
      where: {
        attemptId: created.attempt.id,
        authorizationDecision: ReportRecipientAuthorization.AUTHORIZED,
        status: ReportDeliveryRecipientStatus.PREPARED,
      },
      orderBy: { email: 'asc' },
    })
    await input.onProgress?.(0, recipients.length, 'sending')
    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index]
      if (await input.shouldCancel?.()) {
        cancelled = true
        await prisma.reportDeliveryAttemptRecipient.updateMany({
          where: { attemptId: created.attempt.id, status: ReportDeliveryRecipientStatus.PREPARED },
          data: { status: ReportDeliveryRecipientStatus.SKIPPED, errorMessage: 'Entrega cancelada antes de procesar al destinatario.', completedAt: new Date() },
        })
        break
      }
      await prisma.reportDeliveryAttemptRecipient.update({ where: { id: recipient.id }, data: { status: ReportDeliveryRecipientStatus.SENDING } })
      try {
        const sent = await sendWithRetries(input.adapter, {
          to: [recipient.email],
          subject: input.email.subject,
          text: input.email.text,
          attachments: [{ filename: attachment!.filename, content: attachment!.content, contentType: attachment!.contentType }],
        }, 3)
        const now = new Date()
        await prisma.reportDeliveryAttemptRecipient.update({
          where: { id: recipient.id },
          data: {
            status: ReportDeliveryRecipientStatus.SENT,
            attemptCount: sent.attempts,
            providerMessageId: sent.messageId,
            providerThreadId: sent.threadId ?? null,
            providerInternetMessageId: sent.internetMessageId ?? null,
            attachmentFilename: attachment!.filename,
            attachmentMimeType: attachment!.contentType,
            attachmentByteSize: attachment!.content.byteLength,
            attachmentSha256: attachment!.checksumSha256,
            sentAt: now,
            completedAt: now,
          },
        })
      } catch (error) {
        await prisma.reportDeliveryAttemptRecipient.update({
          where: { id: recipient.id },
          data: {
            status: ReportDeliveryRecipientStatus.FAILED,
            attemptCount: 3,
            errorMessage: sanitizeDeliveryError(error),
            completedAt: new Date(),
          },
        })
      }
      await input.onProgress?.(index + 1, recipients.length, 'sending')
    }
  }

  const [sentCount, failedCount, finalSkippedCount] = await Promise.all([
    prisma.reportDeliveryAttemptRecipient.count({ where: { attemptId: created.attempt.id, status: ReportDeliveryRecipientStatus.SENT } }),
    prisma.reportDeliveryAttemptRecipient.count({ where: { attemptId: created.attempt.id, status: ReportDeliveryRecipientStatus.FAILED } }),
    prisma.reportDeliveryAttemptRecipient.count({ where: { attemptId: created.attempt.id, status: ReportDeliveryRecipientStatus.SKIPPED } }),
  ])
  const status = cancelled
    ? ReportDeliveryAttemptStatus.CANCELLED
    : finalDeliveryAttemptStatus({ intended: authorizedCount, sent: sentCount }) as ReportDeliveryAttemptStatus

  const finalized = await prisma.$transaction(async tx => {
    const attempt = await tx.reportDeliveryAttempt.update({
      where: { id: created.attempt.id },
      data: { status, sentCount, failedCount, skippedCount: finalSkippedCount, errorMessage: preparationError, completedAt: new Date() },
    })
    await enqueueExternalEvent(tx, {
      id: input.userId ?? undefined,
      officeId: input.officeId,
      requestId: input.requestId,
      actorType: input.userId ? 'USER' : 'SYSTEM',
      source: input.userId ? 'WEB' : 'SYSTEM',
    }, {
      eventType: `report.${input.report.reportType}.sent`,
      module: 'reports',
      result: status === ReportDeliveryAttemptStatus.SENT ? 'success' : 'failure',
      recordType: 'ReportDeliveryAttempt',
      recordId: attempt.id,
      description: 'Intento inmutable de entrega de reporte registrado.',
      deduplicationKey: `report-delivery-attempt:${attempt.id}:completed`,
      metadata: {
        reportId: input.report.id,
        versionId: pinnedVersion.id,
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        reportType: input.report.reportType,
        periodDate: input.report.periodDate,
        status,
        mode,
        target,
        sentCount,
        failedCount,
        skippedCount: finalSkippedCount,
        recipientCount: snapshots.length,
        checksumSha256: pinnedVersion.checksumSha256,
      },
    })
    return attempt
  })
  await processActivityOutbox(50).catch(() => undefined)
  return resultFromAttempt(finalized)
}

export async function listReportDeliveryAttempts(officeId: number, reportId: string) {
  const report = await prisma.generatedReport.findFirst({ where: { id: reportId, officeId }, select: { id: true } })
  if (!report) return null
  return prisma.reportDeliveryAttempt.findMany({
    where: { reportId, officeId },
    orderBy: { attemptNumber: 'desc' },
    include: {
      requestedBy: { select: { email: true } },
      reportVersion: { select: { id: true, versionNumber: true, checksumSha256: true, fileName: true } },
      recipients: {
        orderBy: { email: 'asc' },
        select: {
          id: true,
          userId: true,
          email: true,
          authorizationDecision: true,
          status: true,
          attemptCount: true,
          attachmentSha256: true,
          errorMessage: true,
          sentAt: true,
          completedAt: true,
        },
      },
    },
  })
}
