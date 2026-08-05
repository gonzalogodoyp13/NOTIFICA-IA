export type RequestDurations = {
  auth: number
  handler: number
  total: number
}

export type RequestTiming = {
  measureAuth<T>(work: () => Promise<T>): Promise<T>
  measureHandler<T>(work: () => Promise<T>): Promise<T>
  durations(): RequestDurations
}

type Clock = () => number

const rounded = (value: number) => Math.max(0, Math.round(value * 10) / 10)

export function createRequestTiming(clock: Clock = () => performance.now()): RequestTiming {
  const startedAt = clock()
  let auth = 0
  let handler = 0

  async function measure(work: () => Promise<unknown>, assign: (duration: number) => void) {
    const phaseStartedAt = clock()
    try {
      return await work()
    } finally {
      assign(clock() - phaseStartedAt)
    }
  }

  return {
    measureAuth: <T>(work: () => Promise<T>) => measure(work, (value) => { auth = value }) as Promise<T>,
    measureHandler: <T>(work: () => Promise<T>) => measure(work, (value) => { handler = value }) as Promise<T>,
    durations: () => ({ auth: rounded(auth), handler: rounded(handler), total: rounded(clock() - startedAt) }),
  }
}

export function serverTimingHeader(durations: RequestDurations) {
  return `auth;dur=${durations.auth.toFixed(1)}, handler;dur=${durations.handler.toFixed(1)}, total;dur=${durations.total.toFixed(1)}`
}

export function safeApiPath(pathname: string) {
  return pathname
    .split('/')
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ':id'
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id'
      if (/^[a-z0-9_-]{17,}$/i.test(segment)) return ':id'
      return segment
    })
    .join('/')
}

export function safeRegion(region?: string) {
  return region?.trim() || 'local'
}

export function applyTimingHeaders(
  response: Response,
  requestId: string,
  durations: RequestDurations
) {
  response.headers.set('x-request-id', requestId)
  response.headers.set('Server-Timing', serverTimingHeader(durations))
  return response
}

export function operationalTimingRecord(input: {
  operation: string
  method: string
  pathname: string
  status: number
  requestId: string
  region?: string
  durations: RequestDurations
}) {
  return {
    operation: input.operation,
    method: input.method,
    path: safeApiPath(input.pathname),
    status: input.status,
    requestId: input.requestId,
    region: safeRegion(input.region),
    durations: input.durations,
  }
}
