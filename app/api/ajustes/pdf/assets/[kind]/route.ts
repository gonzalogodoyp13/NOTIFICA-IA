import { NextRequest, NextResponse } from 'next/server'

import { ApiError, handleApiError, withApiUser } from '@/lib/api/server'
import { loadOfficePdfAsset, type OfficePdfAssetKind } from '@/lib/pdf/officeConfig'

export const dynamic = 'force-dynamic'
const kinds = new Set<OfficePdfAssetKind>(['firma', 'sello', 'reciboStamp'])

export async function GET(req: NextRequest, { params }: { params: { kind: string } }) {
  return withApiUser(req, 'settings.pdf.preview', async user => {
    try {
      if (!user.isOfficeAdmin) throw new ApiError('FORBIDDEN', 'Solo administradores pueden ver estos recursos', 403)
      if (!kinds.has(params.kind as OfficePdfAssetKind)) throw new ApiError('NOT_FOUND', 'Recurso PDF no encontrado', 404)
      const asset = await loadOfficePdfAsset({ officeId: user.officeId, officeCacheRevision: user.officeCacheRevision }, params.kind as OfficePdfAssetKind)
      if (!asset) throw new ApiError('NOT_FOUND', 'Recurso PDF no encontrado', 404)
      return new NextResponse(Buffer.from(asset), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } })
    } catch (error) {
      return handleApiError(error, { operation: 'settings.pdf.preview', request: req, user })
    }
  })
}
