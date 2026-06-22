import { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiSuccess, parseApiInput, withApiUser } from '@/lib/api/server'
import { recordOperationalActivity } from '@/lib/audit/operationalActivity'
import { checkProviderHealth, getProviderHealth } from '@/lib/recibos/provider-health'

export async function GET(req: NextRequest) {
  return withApiUser(req, 'get receipt provider health', async user => apiSuccess(await getProviderHealth(user.officeId)))
}

export async function POST(req: NextRequest) {
  return withApiUser(req, 'check receipt provider health', async user => {
    const input = parseApiInput(z.object({ provider: z.enum(['microsoft_graph', 'gmail_smtp']).optional() }), await req.json().catch(() => ({})))
    const result = await checkProviderHealth(user.officeId, input.provider)
    await recordOperationalActivity({ userId: user.id, officeId: user.officeId, eventType: 'receipt_health_check', count: result.length, details: { providers: result.map(item => item.provider), statuses: result.map(item => item.status) } })
    return apiSuccess(result)
  })
}
