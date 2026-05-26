const REDACTED = '[REDACTED]'
const RUT_REDACTED = '[RUT oculto]'
const PHONE_REDACTED = '[Telefono oculto]'

const SENSITIVE_KEY_PATTERN =
  /password|pass|token|authorization|cookie|secret|api[_-]?key|access[_-]?token|refresh[_-]?token/i

const RUT_PATTERN = /\b\d{7,9}-[0-9Kk]\b/g
const PHONE_PATTERN = /\b\d{9,11}\b/g

function sanitizeString(value: string) {
  return value
    .replace(RUT_PATTERN, RUT_REDACTED)
    .replace(PHONE_PATTERN, PHONE_REDACTED)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  )
}

function sanitizeAuditValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return sanitizeString(value)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value !== 'object') {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (seen.has(value)) {
    return '[Circular]'
  }

  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item, seen))
  }

  if (!isPlainObject(value)) {
    return sanitizeString(String(value))
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : sanitizeAuditValue(entryValue, seen),
    ])
  )
}

export function sanitizeAuditDiff<T>(diff: T): T {
  return sanitizeAuditValue(diff, new WeakSet<object>()) as T
}
