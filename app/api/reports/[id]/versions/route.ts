import { NextRequest } from 'next/server'

import { ApiError, apiSuccess, withApiUser } from '@/lib/api/server'
import { assertReportAdmin } from '@/lib/reports/access'
import { listReportVersions } from '@/lib/reports/versioning'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return withApiUser(request, 'reports.versions.list', async user => {
    assertReportAdmin(user)
    const result = await listReportVersions(user.officeId, params.id)
    if (!result) throw new ApiError('NOT_FOUND', 'El reporte solicitado no existe.', 404)
    return apiSuccess(result)
  })
}
