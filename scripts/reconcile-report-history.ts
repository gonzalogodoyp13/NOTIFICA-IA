import { createHash } from 'crypto'
import { loadEnvConfig } from '@next/env'
import {
  GeneratedReportVersionStatus,
  PrismaClient,
  ReportDeliveryAttemptMode,
  ReportDeliveryAttemptStatus,
  ReportDeliveryRecipientStatus,
  ReportDeliveryTarget,
  ReportRecipientAuthorization,
} from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

function stableId(prefix: string, value: string) {
  return `${prefix}${createHash('md5').update(value).digest('hex')}`
}

function attemptStatus(value: string) {
  if (value.toLowerCase() === 'sent') return ReportDeliveryAttemptStatus.SENT
  if (value.toLowerCase() === 'partial') return ReportDeliveryAttemptStatus.PARTIAL
  if (value.toLowerCase() === 'failed') return ReportDeliveryAttemptStatus.FAILED
  return ReportDeliveryAttemptStatus.PENDING
}

function recipientStatus(value: string) {
  if (value.toLowerCase() === 'sent') return ReportDeliveryRecipientStatus.SENT
  if (value.toLowerCase() === 'failed') return ReportDeliveryRecipientStatus.FAILED
  if (value.toLowerCase() === 'skipped') return ReportDeliveryRecipientStatus.SKIPPED
  if (value.toLowerCase() === 'sending') return ReportDeliveryRecipientStatus.SENDING
  return ReportDeliveryRecipientStatus.PREPARED
}

async function reconcileVersions() {
  const reports = await prisma.generatedReport.findMany({ include: { versions: { orderBy: { versionNumber: 'asc' } } } })
  let missing = 0
  for (const report of reports) {
    if (report.versions.length) continue
    missing += 1
    if (!apply) continue
    const ready = report.status.toLowerCase() === 'ready'
    const version = await prisma.generatedReportVersion.create({
      data: {
        id: stableId('legacy-version-', report.id),
        reportId: report.id,
        versionNumber: 1,
        status: ready ? GeneratedReportVersionStatus.READY : GeneratedReportVersionStatus.DELETED,
        storageBucket: report.storageBucket,
        storageKey: report.storageKey,
        fileName: report.fileName,
        mimeType: report.mimeType,
        sizeBytes: report.sizeBytes,
        checksumSha256: report.checksumSha256,
        generatedByUserId: report.createdByUserId,
        generationMode: report.generationMode,
        generatedAt: report.generatedAt,
        metadata: { legacyBackfill: true, reconciled: true },
        deletedAt: ready ? null : report.expiresAt ?? report.updatedAt,
      },
    })
    if (ready) await prisma.generatedReport.update({ where: { id: report.id }, data: { currentVersionId: version.id } })
  }
  return missing
}

async function reconcileDeliveries() {
  const batches = await prisma.reportDeliveryBatch.findMany({
    where: { NOT: { id: { in: (await prisma.reportDeliveryAttempt.findMany({ where: { legacyBatchId: { not: null } }, select: { legacyBatchId: true } })).flatMap(item => item.legacyBatchId ? [item.legacyBatchId] : []) } } },
    include: { recipients: true, report: { select: { currentVersionId: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  if (!apply) return batches.length
  for (const batch of batches) {
    const last = batch.reportId ? await prisma.reportDeliveryAttempt.findFirst({ where: { reportId: batch.reportId }, orderBy: { attemptNumber: 'desc' } }) : null
    await prisma.reportDeliveryAttempt.create({
      data: {
        id: stableId('legacy-attempt-', batch.id),
        officeId: batch.officeId,
        reportId: batch.reportId,
        reportVersionId: batch.report?.currentVersionId ?? null,
        attemptNumber: (last?.attemptNumber ?? 0) + 1,
        mode: batch.mode.toLowerCase() === 'scheduled' ? ReportDeliveryAttemptMode.SCHEDULED : ReportDeliveryAttemptMode.MANUAL,
        target: ReportDeliveryTarget.ALL_AUTHORIZED,
        idempotencyKey: `legacy:${batch.id}`,
        provider: batch.provider,
        fromAccount: batch.fromAccount,
        intendedRecipientCount: batch.intendedRecipientCount,
        sentCount: batch.sentCount,
        failedCount: batch.failedCount,
        skippedCount: batch.skippedCount,
        status: attemptStatus(batch.status),
        errorMessage: batch.errorMessage,
        startedAt: batch.startedAt,
        completedAt: batch.completedAt,
        legacyBatchId: batch.id,
        createdAt: batch.createdAt,
        recipients: {
          create: batch.recipients.map(recipient => ({
            id: stableId('legacy-attempt-recipient-', recipient.id),
            userId: recipient.userId,
            email: recipient.email,
            authorizationDecision: ReportRecipientAuthorization.AUTHORIZED,
            status: recipientStatus(recipient.status),
            attemptCount: recipient.attemptCount,
            providerMessageId: recipient.providerMessageId,
            providerThreadId: recipient.providerThreadId,
            providerInternetMessageId: recipient.providerInternetMessageId,
            attachmentFilename: recipient.attachmentFilename,
            attachmentMimeType: recipient.attachmentMimeType,
            attachmentByteSize: recipient.attachmentByteSize,
            attachmentSha256: recipient.attachmentSha256,
            errorMessage: recipient.errorMessage,
            sentAt: recipient.sentAt,
            completedAt: recipient.completedAt,
            legacyRecipientId: recipient.id,
            createdAt: recipient.createdAt,
          })),
        },
      },
    })
  }
  return batches.length
}

async function verifyReadyObjects() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const versions = await prisma.generatedReportVersion.findMany({
    where: { status: GeneratedReportVersionStatus.READY },
    include: { report: { select: { currentVersionId: true } } },
  })
  let invalid = 0
  for (const version of versions) {
    const { data, error } = await supabase.storage.from(version.storageBucket).download(version.storageKey)
    const buffer = data ? Buffer.from(await data.arrayBuffer()) : null
    const checksum = buffer ? createHash('sha256').update(buffer).digest('hex') : null
    const valid = !error && !!buffer && buffer.length === version.sizeBytes && checksum === version.checksumSha256
    if (valid) continue
    invalid += 1
    if (!apply) continue
    await prisma.$transaction(async tx => {
      await tx.generatedReportVersion.update({
        where: { id: version.id },
        data: { status: GeneratedReportVersionStatus.CORRUPT, failedAt: new Date(), errorMessage: 'Post-deploy verification found a missing or corrupt Storage object.' },
      })
      if (version.report.currentVersionId === version.id) {
        await tx.generatedReport.update({ where: { id: version.reportId }, data: { status: 'corrupt' } })
      }
    })
  }
  return invalid
}

async function main() {
  const missingVersions = await reconcileVersions()
  const missingAttempts = await reconcileDeliveries()
  const invalidObjects = await verifyReadyObjects()
  console.log(JSON.stringify({ apply, missingVersions, missingAttempts, invalidObjects }, null, 2))
  if (!apply && (missingVersions || missingAttempts || invalidObjects)) process.exitCode = 2
}

main()
  .catch(error => { console.error(error); process.exitCode = 1 })
  .finally(async () => prisma.$disconnect())
