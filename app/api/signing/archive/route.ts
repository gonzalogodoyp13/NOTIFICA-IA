import { NextRequest, NextResponse } from 'next/server'
import { withApiUser } from '@/lib/api/server'
import { prisma } from '@/lib/prisma'
import { createOfficeFolderService } from '@/lib/signing/officeFolder'
import { deviceFailure } from '@/lib/signing/deviceHttp'

export const dynamic = 'force-dynamic'
const archiveService = () => createOfficeFolderService(prisma, async () => { throw new Error('DEVICE_ENDPOINT_REQUIRED') })
export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.signing.archive', async user => {
    try {
      const data = await archiveService().archive({ officeId: user.officeId, userId: user.id }, Object.fromEntries(req.nextUrl.searchParams))
      return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch (error) { return deviceFailure(error) }
  })
}
