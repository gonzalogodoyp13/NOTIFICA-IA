type LegacyApiFailure = { error?: unknown; message?: unknown }
type StructuredApiFailure = {
  error?: { code?: unknown; message?: unknown; fields?: unknown }
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null)
  if (!payload || typeof payload !== 'object') return fallback

  const structured = payload as StructuredApiFailure
  if (
    structured.error &&
    typeof structured.error === 'object' &&
    typeof structured.error.message === 'string'
  ) {
    return structured.error.message
  }

  const legacy = payload as LegacyApiFailure
  if (typeof legacy.error === 'string') return legacy.error
  if (typeof legacy.message === 'string') return legacy.message
  return fallback
}
