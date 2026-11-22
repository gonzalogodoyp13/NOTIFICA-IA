/** Diagnostic evidence is an allowlist, never a serialized Error/request/payload. */
export type DiagnosticContext = {
  module: string; operation: string; requestId?: string; userId?: string | null;
  officeId?: number | null; jobId?: string | null; recordType?: string; recordId?: string;
  source?: 'server' | 'browser' | 'background'; code?: string;
  clientRelease?: string;
}
export type DiagnosticEvent = DiagnosticContext & {
  reference: string; timestamp: string; environment: string; release: string;
  severity: 'error'; code: string; message: string; errorType: string; frames: string[];
}
export const safeLabel = (value: unknown, fallback = 'unknown') =>
  typeof value === 'string' && /^[a-zA-Z0-9_.:/@-]{1,160}$/.test(value) ? value : fallback

export function evidence(error: unknown): { errorType: string; frames: string[] } {
  // Drop messages entirely: even innocuous keys can contain documents or secrets.
  const errorType = error instanceof Error && /^(Error|TypeError|RangeError|SyntaxError|ApiError|PrismaClientKnownRequestError|TransientDeliveryError|SigningError)$/.test(error.name) ? error.name : 'Error'
  const frames = error instanceof Error ? (error.stack ?? '').split('\n').slice(1, 25).flatMap(line => {
    // Only source filename + line/column; no absolute paths, function arguments or URLs.
    const match = line.match(/[/\\]([a-zA-Z0-9_.-]+\.(?:[cm]?js|tsx?)):(\d+):(\d+)\)?$/)
    return match ? [`${match[1]}:${match[2]}:${match[3]}`] : []
  }) : []
  return { errorType, frames }
}

export function diagnosticEvent(error: unknown, context: DiagnosticContext, reference: string): DiagnosticEvent {
  return {
    reference, timestamp: new Date().toISOString(), severity: 'error',
    environment: safeLabel(process.env.APP_ENV ?? process.env.NODE_ENV),
    release: safeLabel(process.env.APP_RELEASE ?? process.env.NEXT_PUBLIC_APP_RELEASE, 'unconfigured'),
    clientRelease: context.source === 'browser' ? safeLabel(context.clientRelease, 'unconfigured') : undefined,
    module: safeLabel(context.module), operation: safeLabel(context.operation),
    requestId: safeLabel(context.requestId, reference),
    userId: context.userId ? safeLabel(context.userId) : null,
    officeId: Number.isSafeInteger(context.officeId) && context.officeId! > 0 ? context.officeId : null,
    jobId: context.jobId ? safeLabel(context.jobId) : null,
    recordType: context.recordType ? safeLabel(context.recordType) : undefined,
    recordId: context.recordId ? safeLabel(context.recordId) : undefined,
    source: context.source ?? 'server', code: safeLabel(context.code, 'UNEXPECTED_FAILURE'),
    message: 'No se pudo completar la operación.', ...evidence(error),
  }
}

export function groupingKey(event: DiagnosticEvent) {
  return JSON.stringify([event.environment, event.source, event.module, event.operation, event.code, event.errorType, event.frames.slice(0, 5)])
}
