import 'server-only'
import { randomUUID } from 'node:crypto'
import { safeSigningError } from './core'
import { AsyncLocalStorage } from 'node:async_hooks'
export const signingTrace = new AsyncLocalStorage<string>()

// Deliberately projects an allowlist. Never spread requests, errors or credentials.
export function signingLog(operation: 'device_request' | 'maintenance', correlationId: string, status: number, errorCode?: unknown) {
  console.info(JSON.stringify({ subsystem: 'signing', operation,
    correlationId: /^[a-f0-9-]{36}$/.test(correlationId) ? correlationId : randomUUID(),
    status, errorCode: errorCode === undefined ? null : safeSigningError(errorCode).code, at: new Date().toISOString() }))
}
