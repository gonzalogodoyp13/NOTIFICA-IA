import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { reportUnexpected } from '@/lib/diagnostics/server'
import { withDiagnosticContext } from '@/lib/diagnostics/context'

import {
  createRequestTiming,
  applyTimingHeaders,
  operationalTimingRecord,
  type RequestTiming,
} from '@/lib/api/requestTimingCore'

const requestIds = new WeakMap<object, string>()

export function requestIdFor(request?: NextRequest) {
  if (!request) return crypto.randomUUID()
  let id = requestIds.get(request)
  if (!id) { id = crypto.randomUUID(); requestIds.set(request, id) }
  return id
}

export function finishTimedResponse(input: {
  request: NextRequest
  operation: string
  requestId: string
  timing: RequestTiming
  response: Response
}) {
  const durations = input.timing.durations()
  applyTimingHeaders(input.response, input.requestId, durations)
  input.response.headers.set('Cache-Control', 'private, no-store')
  input.response.headers.set('X-Content-Type-Options', 'nosniff')

  console.info('[API_TIMING]', JSON.stringify(operationalTimingRecord({
    operation: input.operation,
    method: input.request.method,
    pathname: input.request.nextUrl.pathname,
    status: input.response.status,
    requestId: input.requestId,
    region: process.env.VERCEL_REGION,
    durations,
  })))
  return input.response
}

export async function withRequestTiming(
  request: NextRequest,
  operation: string,
  handler: () => Promise<Response>
) {
  const timing = createRequestTiming()
  const requestId = requestIdFor(request)
  let response: Response
  try {
    response = await withDiagnosticContext({ module: 'internal', operation, requestId }, () => timing.measureHandler(handler))
  } catch (error) {
    const supportReference = await reportUnexpected(error, { module: 'internal', operation, requestId })
    response = NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: `Ocurrió un error inesperado. Referencia: ${supportReference}`, supportReference } },
      { status: 500 }
    )
  }
  return finishTimedResponse({ request, operation, requestId, timing, response })
}
