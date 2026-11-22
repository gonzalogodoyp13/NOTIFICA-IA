import * as Sentry from '@sentry/nextjs'
import type { DiagnosticEvent } from './core'

/** Only pre-sanitized evidence crosses the external monitoring boundary. */
export function reportToMonitor(event: DiagnosticEvent) {
  Sentry.captureEvent({
    event_id: event.reference.replaceAll('-', ''), level: 'error', message: event.message,
    environment: event.environment, release: event.release,
    tags: { diagnostic: 'sanitized', reference: event.reference, operation: event.operation },
    extra: { diagnostic: event }, fingerprint: [event.module, event.operation, event.code, event.errorType, ...event.frames.slice(0, 5)],
  })
}
export function flushMonitor() { return Sentry.flush(1500) }

export function initializeMonitor(dsn?: string) {
  Sentry.init({ dsn, enabled: !!dsn, defaultIntegrations: false,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
      graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false }, mcp: { inputs: false, outputs: false } },
    tracesSampleRate: 0, maxBreadcrumbs: 0,
    beforeSend(event) {
      // Reject automatic/raw SDK events. Reconstruct rather than blacklist fields.
      if (event.tags?.diagnostic !== 'sanitized') return null
      return { type: event.type, event_id: event.event_id, level: event.level, message: event.message,
        environment: event.environment, release: event.release,
        tags: { diagnostic: 'sanitized', reference: event.tags.reference, operation: event.tags.operation },
        extra: { diagnostic: event.extra?.diagnostic }, fingerprint: event.fingerprint }
    },
  })
}
