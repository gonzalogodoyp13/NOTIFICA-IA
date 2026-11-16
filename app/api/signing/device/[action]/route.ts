import { NextRequest } from 'next/server'
import { createDeviceHandler } from '@/lib/signing/deviceHttp'
import { withRequestTiming } from '@/lib/api/requestTiming'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180
const handleDeviceRequest = createDeviceHandler()
export async function POST(req: NextRequest, props: { params: Promise<{ action: string }> }) {
  const params = await props.params;
  return withRequestTiming(req, 'signing.device', () => handleDeviceRequest(req, params.action))
}
