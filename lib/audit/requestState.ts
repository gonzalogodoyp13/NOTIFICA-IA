import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

type AuditRequestState = { eventRecorded: boolean }

const storage = new AsyncLocalStorage<AuditRequestState>()

export function runWithAuditRequestState<T>(callback: () => Promise<T>) {
  return storage.run({ eventRecorded: false }, callback)
}

export function markRequestEventRecorded() {
  const state = storage.getStore()
  if (state) state.eventRecorded = true
}

export function requestEventWasRecorded() {
  return storage.getStore()?.eventRecorded ?? false
}
