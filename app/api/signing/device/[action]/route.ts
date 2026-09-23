import { NextRequest } from 'next/server'
import { createDeviceHandler } from '@/lib/signing/deviceHttp'
import { withRequestTiming } from '@/lib/api/requestTiming'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180
const handleDeviceRequest = createDeviceHandler()
export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  return withRequestTiming(req, 'signing.device', () => handleDeviceRequest(req, params.action))
}
