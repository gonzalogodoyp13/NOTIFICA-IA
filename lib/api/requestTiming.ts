import 'server-only'

import { NextRequest, NextResponse } from 'next/server'

import {
  createRequestTiming,
  applyTimingHeaders,
  operationalTimingRecord,
  type RequestTiming,
} from '@/lib/api/requestTimingCore'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

export function requestIdFor(request?: NextRequest) {
  const supplied = request?.headers.get('x-request-id')?.trim()
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID()
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
    response = await timing.measureHandler(handler)
  } catch {
    response = NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado' } },
      { status: 500 }
    )
  }
  return finishTimedResponse({ request, operation, requestId, timing, response })
}
