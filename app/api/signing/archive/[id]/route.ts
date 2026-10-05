import { NextRequest, NextResponse } from 'next/server'
import { withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'
import { createOfficeFolderService } from '@/lib/signing/officeFolder'
import { deviceFailure } from '@/lib/signing/deviceHttp'
import { contentDispositionForPdf } from '@/lib/documents/downloadFileName'
import { recordActivityEvent } from '@/lib/audit/activityEvent'

export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiUser(req, 'get.signing.archive.download', async user => {
    try {
      const service = createOfficeFolderService(prisma, async () => { throw new Error('DEVICE_ENDPOINT_REQUIRED') })
      const result = await service.archiveDownload({ officeId: user.officeId, userId: user.id }, {
        signatureId: params.id, checksumSha256: req.nextUrl.searchParams.get('checksum') })
      await recordActivityEvent({ userId: user.id, officeId: user.officeId, eventType: 'document.download', module: 'documents',
        result: 'success', recordType: 'DocumentSignature', recordId: params.id, description: 'Firma recuperada del archivo de la oficina.' })
      return new NextResponse(new Uint8Array(result.bytes), { headers: { 'Content-Type': 'application/pdf',
        'Content-Length': String(result.bytes.length), 'Content-Disposition': contentDispositionForPdf(req.nextUrl.searchParams.get('mode'), result.fileName),
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
    } catch (error) { return deviceFailure(error) }
  })
}
