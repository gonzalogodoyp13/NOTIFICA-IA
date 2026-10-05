import { NextRequest } from 'next/server'
import { withApiUser } from '@/lib/api/server'
import { createDeviceService } from '@/lib/signing/devices'
import { deviceFailure, deviceResponse, readDeviceBody, requireDeviceBrowserOrigin } from '@/lib/signing/deviceHttp'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
const service = createDeviceService()
export async function GET(req: NextRequest) {
  return withApiUser(req, 'get.signing.devices', async user => {
    try { return deviceResponse(await service.list({ officeId: user.officeId, userId: user.id })) }
    catch (error) { return deviceFailure(error) }
  })
}
export async function POST(req: NextRequest) {
  return withApiUser(req, 'post.signing.devices', async user => {
    try {
      requireDeviceBrowserOrigin(req)
      const context = { officeId: user.officeId, userId: user.id }
      await service.throttle('admin-device', user.id, 20)
      const raw = await readDeviceBody(req)
      const input = z.discriminatedUnion('action', [
        z.object({ action: z.literal('enroll'), role: z.enum(['SIGNER', 'RECEIVER', 'SIGNER_RECEIVER']) }).strict(),
        z.object({ action: z.literal('revoke'), deviceId: z.string() }).strict(),
        z.object({ action: z.literal('revoke-enrollment'), enrollmentId: z.string() }).strict(),
      ]).parse(raw)
      return deviceResponse(input.action === 'enroll' ? await service.createEnrollment(context, { role: input.role })
        : input.action === 'revoke' ? await service.revoke(context, input.deviceId)
        : await service.revokeEnrollment(context, input.enrollmentId))
    } catch (error) { return deviceFailure(error) }
  })
}
