import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { ReportVersionError, restoreMonthlyReportVersion } from '@/lib/reports/versioning'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  return withApiUser(request, 'reports.versions.restore', async user => {
    assertReportAdmin(user)
    try {
      const result = await restoreMonthlyReportVersion({
        officeId: user.officeId,
        reportId: params.id,
        versionId: params.versionId,
        userId: user.id,
        requestId: user.requestId,
      })
      return apiSuccess({
        restored: result.restored,
        reportId: result.report.id,
        versionId: result.version.id,
        versionNumber: result.version.versionNumber,
        checksumSha256: result.version.checksumSha256,
      })
    } catch (error) {
      if (!(error instanceof ReportVersionError)) throw error
      const status = error.reason === 'not_found' ? 404 : 409
      throw new ApiError(error.reason === 'not_found' ? 'NOT_FOUND' : 'CONFLICT', error.message, status)
    }
  })
}
