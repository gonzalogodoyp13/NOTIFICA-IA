import { NextRequest } from 'next/server'

import { ApiError, withApiUser } from '@/lib/api/server'
import { getReportForDownload } from '@/lib/reports/dailyReport'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return withApiUser(request, 'reports.download', async (user) => {
    const result = await getReportForDownload(user.officeId, params.id)
    if (!result) throw new ApiError('NOT_FOUND', 'El reporte solicitado no existe.', 404)
    return new Response(result.buffer, {
      headers: {
        'Content-Type': result.report.mimeType,
        'Content-Disposition': `attachment; filename="${result.report.fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  })
}
