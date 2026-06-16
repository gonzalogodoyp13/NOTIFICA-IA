export type JsonObject = Record<string, unknown>

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asJsonObject(value: unknown): JsonObject | null {
  return isJsonObject(value) ? value : null
}

export function getString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function getFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
