import type { Instrumentation } from 'next'
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config')
}
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { reportUnexpected } = await import('./lib/diagnostics/server')
    await reportUnexpected(error, { module: 'next', operation: context.routeType, code: 'UNHANDLED_SERVER_ERROR' })
  }
}
