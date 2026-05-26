type LogMeta = Record<string, unknown>

export function isDebugLoggingEnabled() {
  if (process.env.DEBUG_LOGS === 'false') {
    return false
  }

  return (
    process.env.DEBUG_LOGS === 'true' ||
    process.env.NEXT_PUBLIC_ENVIRONMENT === 'development' ||
    process.env.NODE_ENV === 'development'
  )
}

export function debugLog(message: string, meta?: LogMeta) {
  if (!isDebugLoggingEnabled()) {
    return
  }

  if (meta) {
    console.debug(message, meta)
    return
  }

  console.debug(message)
}

export function toSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
