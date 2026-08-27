import { NextRequest } from 'next/server'

import { ApiError, withApiUser } from '@/lib/api/server'
import { recordCriticalEvent } from '@/lib/audit/activityEvent'
import { prisma } from '@/lib/prisma'
import { canAccessReports } from '@/lib/reports/access'
import { downloadVerifiedReportVersion, ReportVersionError } from '@/lib/reports/versioning'

export const dynamic = 'force-dynamic'

async function auditDownload(input: {
  user: { id: string; officeId: number; requestId: string }
  eventType: 'report.downloaded' | 'report.download_denied' | 'report.download_failed'
  result: 'success' | 'denied' | 'failure'
  reportId: string
  versionId?: string | null
  reportType?: 'daily' | 'monthly' | 'custom'
  periodDate?: string
  checksumSha256?: string | null
  sizeBytes?: number | null
  current?: boolean
  reason?: 'permission' | 'office_boundary' | 'not_found' | 'unavailable' | 'storage' | 'checksum' | 'audit'
}) {
  return recordCriticalEvent(prisma, input.user, {
    eventType: input.eventType,
    module: 'reports',
    result: input.result,
    recordType: 'GeneratedReportVersion',
    recordId: input.versionId ?? input.reportId,
    description: input.eventType === 'report.downloaded'
      ? 'Reporte descargado por un administrador.'
      : input.eventType === 'report.download_denied'
        ? 'Descarga de reporte denegada.'
        : 'Descarga de reporte fallida.',
    deduplicationKey: `report-download:${input.user.requestId}:${input.eventType}`,
    metadata: {
      reportId: input.reportId,
      versionId: input.versionId ?? null,
      ...(input.reportType ? { reportType: input.reportType } : {}),
      ...(input.periodDate ? { periodDate: input.periodDate } : {}),
      checksumSha256: input.checksumSha256 ?? null,
      sizeBytes: input.sizeBytes ?? null,
      requestId: input.user.requestId,
      ...(input.current === undefined ? {} : { current: input.current }),
      ...(input.reason ? { reason: input.reason } : {}),
    },
  })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return withApiUser(request, 'reports.download', async user => {
    const requestedVersionId = request.nextUrl.searchParams.get('versionId')
    if (!canAccessReports(user)) {
      await auditDownload({
        user,
        eventType: 'report.download_denied',
        result: 'denied',
        reportId: params.id,
        versionId: requestedVersionId,
        reason: 'permission',
      })
      throw new ApiError('FORBIDDEN', 'Solo administradores activos pueden descargar reportes.', 403)
    }

    const reportIdentity = await prisma.generatedReport.findUnique({
      where: { id: params.id },
      select: { officeId: true, reportType: true, periodDate: true },
    })
    if (!reportIdentity) {
      await auditDownload({ user, eventType: 'report.download_failed', result: 'failure', reportId: params.id, versionId: requestedVersionId, reason: 'not_found' })
      throw new ApiError('NOT_FOUND', 'El reporte solicitado no existe.', 404)
    }
    if (reportIdentity.officeId !== user.officeId) {
      await auditDownload({ user, eventType: 'report.download_denied', result: 'denied', reportId: params.id, versionId: requestedVersionId, reason: 'office_boundary' })
      throw new ApiError('NOT_FOUND', 'El reporte solicitado no existe.', 404)
    }

    try {
      const result = await downloadVerifiedReportVersion({ officeId: user.officeId, reportId: params.id, versionId: requestedVersionId })
      await auditDownload({
        user,
        eventType: 'report.downloaded',
        result: 'success',
        reportId: result.report.id,
        versionId: result.version.id,
        reportType: result.report.reportType as 'daily' | 'monthly' | 'custom',
        periodDate: result.report.periodDate,
        checksumSha256: result.version.checksumSha256,
        sizeBytes: result.version.sizeBytes,
        current: result.current,
      })
      const fileName = result.version.fileName.replace(/["\r\n]/g, '_')
      return new Response(new Blob([new Uint8Array(result.buffer)], { type: result.version.mimeType }), {
        headers: {
          'Content-Type': result.version.mimeType,
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (error) {
      if (!(error instanceof ReportVersionError)) throw error
      await auditDownload({
        user,
        eventType: 'report.download_failed',
        result: 'failure',
        reportId: params.id,
        versionId: error.version?.id ?? requestedVersionId,
        reportType: reportIdentity.reportType as 'daily' | 'monthly' | 'custom',
        periodDate: reportIdentity.periodDate,
        checksumSha256: error.version?.checksumSha256,
        sizeBytes: error.version?.sizeBytes,
        reason: error.reason,
      })
      const status = error.reason === 'not_found' ? 404 : error.reason === 'unavailable' ? 409 : 503
      throw new ApiError(error.reason === 'not_found' ? 'NOT_FOUND' : error.reason === 'unavailable' ? 'CONFLICT' : 'SERVICE_UNAVAILABLE', error.message, status)
    }
  })
}
