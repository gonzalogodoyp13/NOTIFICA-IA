import 'server-only'

import { randomUUID } from 'crypto'
import { GeneratedReportVersionStatus, Prisma, type GeneratedReport, type GeneratedReportVersion } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { enqueueExternalEvent, processActivityOutbox } from '@/lib/audit/outbox'
import { recordCriticalEvent } from '@/lib/audit/activityEvent'
import {
  REPORT_STORAGE_BUCKET,
  XLSX_MIME_TYPE,
  dailyReportFileName,
  deleteReportFile,
  downloadReportFile,
  monthlyReportFileName,
  reportChecksum,
  reportVersionStorageKey,
  uploadReportVersionWorkbook,
  verifyStoredReportFile,
  type StoredReportFile,
} from './storage'
import { shouldSwitchCurrentVersion, versionIdsToPrune } from './reportSafetyCore'

export type ReportKind = 'daily' | 'monthly' | 'custom'

type ReserveInput = {
  officeId: number
  reportType: ReportKind
  identityKey?: string
  customDefinitionId?: string | null
  periodStart: Date
  periodEnd: Date
  periodDate: string
  timezone: string
  activityCount: number
  generatedAt: Date
  expiresAt: Date | null
  generatedByUserId?: string | null
  generationMode: string
  metadata: Prisma.InputJsonValue
}

export class ReportVersionError extends Error {
  constructor(
    public readonly reason: 'not_found' | 'unavailable' | 'storage' | 'checksum',
    message: string,
    public readonly report?: GeneratedReport,
    public readonly version?: GeneratedReportVersion
  ) {
    super(message)
    this.name = 'ReportVersionError'
  }
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim().slice(0, 500)
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

async function ensureLogicalReport(input: ReserveInput) {
  const identityKey = input.identityKey ?? input.reportType
  const uniqueWhere = {
    officeId_identityKey_periodStart_periodEnd: {
      officeId: input.officeId,
      identityKey,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
  }
  const existing = await prisma.generatedReport.findUnique({ where: uniqueWhere })
  if (existing) return existing

  const id = randomUUID()
  try {
    return await prisma.generatedReport.create({
      data: {
        id,
        officeId: input.officeId,
        reportType: input.reportType,
        identityKey,
        customDefinitionId: input.customDefinitionId ?? null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        periodDate: input.periodDate,
        timezone: input.timezone,
        status: 'generating',
        storageBucket: REPORT_STORAGE_BUCKET,
        storageKey: `pending/${id}`,
        fileName: input.reportType === 'daily' ? dailyReportFileName(input.periodDate) : input.reportType === 'monthly' ? monthlyReportFileName(input.periodDate) : `reporte-personalizado-${input.periodDate}.xlsx`,
        mimeType: XLSX_MIME_TYPE,
        sizeBytes: 0,
        checksumSha256: '',
        activityCount: input.activityCount,
        generatedAt: input.generatedAt,
        expiresAt: input.expiresAt,
        createdByUserId: input.generatedByUserId ?? null,
        generationMode: input.generationMode,
        metadata: input.metadata,
      },
    })
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error
    return prisma.generatedReport.findUniqueOrThrow({ where: uniqueWhere })
  }
}

export async function reserveReportVersion(input: ReserveInput) {
  const report = await ensureLogicalReport(input)
  return prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "generated_reports" WHERE "id" = ${report.id} FOR UPDATE`)
    const last = await tx.generatedReportVersion.findFirst({
      where: { reportId: report.id },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    })
    const versionNumber = (last?.versionNumber ?? 0) + 1
    const storageKey = reportVersionStorageKey({
      officeId: input.officeId,
      reportType: input.reportType,
      periodDate: input.periodDate,
      reportId: report.id,
      versionNumber,
    })
    const version = await tx.generatedReportVersion.create({
      data: {
        reportId: report.id,
        versionNumber,
        status: GeneratedReportVersionStatus.UPLOADING,
        storageBucket: REPORT_STORAGE_BUCKET,
        storageKey,
        fileName: input.reportType === 'daily' ? dailyReportFileName(input.periodDate) : input.reportType === 'monthly' ? monthlyReportFileName(input.periodDate) : `reporte-personalizado-${input.periodDate}.xlsx`,
        mimeType: XLSX_MIME_TYPE,
        generatedByUserId: input.generatedByUserId ?? null,
        generationMode: input.generationMode,
        generatedAt: input.generatedAt,
        metadata: input.metadata,
      },
    })
    return { report: await tx.generatedReport.findUniqueOrThrow({ where: { id: report.id } }), version }
  })
}

async function markCandidateFailed(input: {
  reportId: string
  versionId: string
  status: 'FAILED' | 'CORRUPT'
  error: unknown
}) {
  const now = new Date()
  await prisma.$transaction(async tx => {
    await tx.generatedReportVersion.update({
      where: { id: input.versionId },
      data: {
        status: input.status === 'CORRUPT' ? GeneratedReportVersionStatus.CORRUPT : GeneratedReportVersionStatus.FAILED,
        errorMessage: safeError(input.error),
        failedAt: now,
      },
    })
    const report = await tx.generatedReport.findUnique({ where: { id: input.reportId }, select: { currentVersionId: true } })
    if (report && !report.currentVersionId) {
      await tx.generatedReport.update({ where: { id: input.reportId }, data: { status: input.status.toLowerCase() } })
    }
  })
}

export async function persistReportVersion(input: ReserveInput & {
  buildWorkbook: () => Promise<Buffer>
  cancellationCheck?: () => Promise<boolean>
  requestId?: string
}) {
  const reserved = await reserveReportVersion(input)
  let uploaded: StoredReportFile | null = null
  let finalized = false
  try {
    if (await input.cancellationCheck?.()) throw new Error('Trabajo cancelado antes de construir el archivo.')
    const buffer = await input.buildWorkbook()
    if (await input.cancellationCheck?.()) throw new Error('Trabajo cancelado antes de cargar el archivo.')
    uploaded = await uploadReportVersionWorkbook({
      buffer,
      storageKey: reserved.version.storageKey,
      fileName: reserved.version.fileName,
    })
    await verifyStoredReportFile(uploaded)
    if (await input.cancellationCheck?.()) throw new Error('Trabajo cancelado antes de activar la versión.')

    const report = await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "generated_reports" WHERE "id" = ${reserved.report.id} FOR UPDATE`)
      const logicalReport = await tx.generatedReport.findUniqueOrThrow({
        where: { id: reserved.report.id },
        include: { currentVersion: { select: { versionNumber: true } } },
      })
      const hadCurrentVersion = !!logicalReport.currentVersionId
      const version = await tx.generatedReportVersion.update({
        where: { id: reserved.version.id },
        data: {
          status: GeneratedReportVersionStatus.READY,
          sizeBytes: uploaded!.sizeBytes,
          checksumSha256: uploaded!.checksumSha256,
          errorMessage: null,
          failedAt: null,
        },
      })
      const shouldSwitchCurrent = shouldSwitchCurrentVersion(version.versionNumber, logicalReport.currentVersion?.versionNumber)
      const updated = shouldSwitchCurrent
        ? await tx.generatedReport.update({
          where: { id: reserved.report.id },
          data: {
            status: 'ready',
            currentVersionId: version.id,
            storageBucket: version.storageBucket,
            storageKey: version.storageKey,
            fileName: version.fileName,
            mimeType: version.mimeType,
            sizeBytes: version.sizeBytes!,
            checksumSha256: version.checksumSha256!,
            activityCount: input.activityCount,
            generatedAt: input.generatedAt,
            expiresAt: input.expiresAt,
            createdByUserId: input.generatedByUserId ?? null,
            generationMode: input.generationMode,
            metadata: input.metadata,
          },
        })
        : logicalReport
      await enqueueExternalEvent(tx, {
        id: input.generatedByUserId ?? undefined,
        officeId: input.officeId,
        requestId: input.requestId,
        actorType: input.generatedByUserId ? 'USER' : 'SYSTEM',
        source: input.generatedByUserId ? 'WEB' : 'SYSTEM',
      }, {
        eventType: `report.${input.reportType}.${hadCurrentVersion ? 'regenerated' : 'generated'}`,
        module: 'reports',
        result: 'success',
        recordType: 'GeneratedReportVersion',
        recordId: version.id,
        description: hadCurrentVersion ? 'Version de reporte regenerada.' : 'Reporte generado.',
        deduplicationKey: `report-version:${version.id}:ready`,
        metadata: {
          reportId: updated.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          reportType: input.reportType,
          periodDate: input.periodDate,
          activityCount: input.activityCount,
          checksumSha256: version.checksumSha256!,
          sizeBytes: version.sizeBytes!,
          generationMode: input.generationMode,
        },
      })
      return updated
    })
    finalized = true
    await processActivityOutbox(50).catch(() => undefined)
    if (input.reportType === 'monthly' || input.reportType === 'custom') await pruneMonthlyReportVersions(report.id).catch(() => undefined)
    return { report, versionId: reserved.version.id, versionNumber: reserved.version.versionNumber }
  } catch (error) {
    if (finalized) throw error
    const corrupt = /checksum|tamano|tamaño|coincide/i.test(safeError(error))
    await markCandidateFailed({
      reportId: reserved.report.id,
      versionId: reserved.version.id,
      status: corrupt ? 'CORRUPT' : 'FAILED',
      error,
    }).catch(() => undefined)
    if (uploaded) {
      await deleteReportFile(uploaded.storageBucket, uploaded.storageKey).catch(() => undefined)
    }
    throw error
  }
}

export async function downloadVerifiedReportVersion(input: {
  officeId: number
  reportId: string
  versionId?: string | null
}) {
  const report = await prisma.generatedReport.findFirst({
    where: { id: input.reportId, officeId: input.officeId },
    include: {
      currentVersion: true,
      versions: input.versionId ? { where: { id: input.versionId }, take: 1 } : false,
    },
  })
  if (!report) throw new ReportVersionError('not_found', 'El reporte solicitado no existe.')
  const version = input.versionId ? report.versions[0] : report.currentVersion
  if (!version) throw new ReportVersionError('not_found', 'La version solicitada no existe.', report)
  if (version.status !== GeneratedReportVersionStatus.READY || version.sizeBytes === null || !version.checksumSha256) {
    throw new ReportVersionError('unavailable', 'La version solicitada no esta disponible.', report, version)
  }

  let buffer: Buffer
  try {
    buffer = await downloadReportFile(version.storageBucket, version.storageKey)
  } catch (error) {
    throw new ReportVersionError('storage', safeError(error), report, version)
  }
  const checksumSha256 = reportChecksum(buffer)
  if (buffer.length !== version.sizeBytes || checksumSha256 !== version.checksumSha256) {
    await prisma.$transaction(async tx => {
      await tx.generatedReportVersion.update({
        where: { id: version.id },
        data: {
          status: GeneratedReportVersionStatus.CORRUPT,
          errorMessage: 'El archivo almacenado no coincide con su checksum o tamano registrado.',
          failedAt: new Date(),
        },
      })
      if (report.currentVersionId === version.id) {
        await tx.generatedReport.update({ where: { id: report.id }, data: { status: 'corrupt' } })
      }
    })
    throw new ReportVersionError('checksum', 'La integridad del reporte no pudo verificarse.', report, version)
  }
  return { report, version, buffer, current: report.currentVersionId === version.id }
}

export async function listReportVersions(officeId: number, reportId: string) {
  const report = await prisma.generatedReport.findFirst({ where: { id: reportId, officeId }, select: { id: true, reportType: true, currentVersionId: true } })
  if (!report) return null
  const versions = await prisma.generatedReportVersion.findMany({
    where: { reportId },
    orderBy: { versionNumber: 'desc' },
    select: {
      id: true,
      versionNumber: true,
      status: true,
      fileName: true,
      sizeBytes: true,
      checksumSha256: true,
      generationMode: true,
      generatedAt: true,
      errorMessage: true,
      deletedAt: true,
      generatedBy: { select: { email: true } },
    },
  })
  return { ...report, versions: versions.map(version => ({ ...version, isCurrent: version.id === report.currentVersionId })) }
}

export async function restoreMonthlyReportVersion(input: {
  officeId: number
  reportId: string
  versionId: string
  userId: string
  requestId: string
}) {
  const verified = await downloadVerifiedReportVersion({ officeId: input.officeId, reportId: input.reportId, versionId: input.versionId })
  if (verified.report.reportType !== 'monthly') throw new ReportVersionError('unavailable', 'Solo los reportes mensuales admiten restauracion.', verified.report, verified.version)
  if (verified.current) return { report: verified.report, version: verified.version, restored: false }

  const result = await prisma.$transaction(async tx => {
    const current = await tx.generatedReport.findFirst({ where: { id: input.reportId, officeId: input.officeId } })
    if (!current) throw new ReportVersionError('not_found', 'El reporte solicitado no existe.')
    const updated = await tx.generatedReport.update({
      where: { id: current.id },
      data: {
        currentVersionId: verified.version.id,
        status: 'ready',
        storageBucket: verified.version.storageBucket,
        storageKey: verified.version.storageKey,
        fileName: verified.version.fileName,
        mimeType: verified.version.mimeType,
        sizeBytes: verified.version.sizeBytes!,
        checksumSha256: verified.version.checksumSha256!,
        generatedAt: verified.version.generatedAt,
        generationMode: 'restored',
      },
    })
    await recordCriticalEvent(tx, { id: input.userId, officeId: input.officeId, requestId: input.requestId }, {
      eventType: 'report.version.restored',
      module: 'reports',
      result: 'success',
      recordType: 'GeneratedReportVersion',
      recordId: verified.version.id,
      description: 'Version mensual restaurada como actual.',
      deduplicationKey: `report-version:${verified.version.id}:restored:${input.requestId}`,
      metadata: {
        reportId: current.id,
        versionId: verified.version.id,
        previousVersionId: current.currentVersionId,
        versionNumber: verified.version.versionNumber,
        reportType: 'monthly',
        periodDate: current.periodDate,
        checksumSha256: verified.version.checksumSha256!,
        sizeBytes: verified.version.sizeBytes!,
      },
    })
    return updated
  })
  return { report: result, version: verified.version, restored: true }
}

async function deleteVersionObject(version: GeneratedReportVersion) {
  await prisma.generatedReportVersion.update({
    where: { id: version.id },
    data: { status: GeneratedReportVersionStatus.DELETE_PENDING, deleteRequestedAt: new Date(), errorMessage: null },
  })
  try {
    await deleteReportFile(version.storageBucket, version.storageKey)
    await prisma.generatedReportVersion.update({
      where: { id: version.id },
      data: { status: GeneratedReportVersionStatus.DELETED, deletedAt: new Date(), errorMessage: null },
    })
    return true
  } catch (error) {
    await prisma.generatedReportVersion.update({
      where: { id: version.id },
      data: { status: GeneratedReportVersionStatus.DELETE_FAILED, errorMessage: safeError(error) },
    })
    return false
  }
}

export async function pruneMonthlyReportVersions(reportId: string) {
  const report = await prisma.generatedReport.findUnique({ where: { id: reportId }, select: { currentVersionId: true, reportType: true } })
  if (!report || report.reportType !== 'monthly') return { deleted: 0, failed: 0 }
  const readyVersions = await prisma.generatedReportVersion.findMany({
    where: { reportId, status: GeneratedReportVersionStatus.READY },
    orderBy: { versionNumber: 'desc' },
  })
  const pruneIds = versionIdsToPrune(readyVersions, report.currentVersionId, 10)
  const previous = readyVersions.filter(version => pruneIds.includes(version.id))
  let deleted = 0
  let failed = 0
  for (const version of previous) {
    if (await deleteVersionObject(version)) deleted += 1
    else failed += 1
  }
  return { deleted, failed }
}

export async function cleanupReportVersions(officeId: number) {
  const retry = await prisma.generatedReportVersion.findMany({
    where: { report: { officeId }, status: GeneratedReportVersionStatus.DELETE_FAILED },
    orderBy: { deleteRequestedAt: 'asc' },
    take: 50,
  })
  let deleted = 0
  let failed = 0
  for (const version of retry) {
    if (await deleteVersionObject(version)) deleted += 1
    else failed += 1
  }
  return { deleted, failed }
}

export async function deleteAllReportVersions(reportId: string) {
  const versions = await prisma.generatedReportVersion.findMany({
    where: { reportId, status: { in: [GeneratedReportVersionStatus.READY, GeneratedReportVersionStatus.DELETE_FAILED] } },
  })
  let deleted = 0
  let failed = 0
  for (const version of versions) {
    if (await deleteVersionObject(version)) deleted += 1
    else failed += 1
  }
  return { deleted, failed }
}
