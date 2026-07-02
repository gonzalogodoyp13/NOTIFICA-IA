import { timingSafeEqual } from 'crypto'

export function isSecretAuthorized(expected: string | null | undefined, supplied: string | null | undefined) {
  if (!expected?.trim() || !supplied?.trim()) return false
  const expectedBytes = Buffer.from(expected.trim())
  const suppliedBytes = Buffer.from(supplied.trim())
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
}

export function bearerOrHeaderSecret(headers: Headers, headerName: string) {
  const authorization = headers.get('authorization')
  return authorization?.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : headers.get(headerName)?.trim()
}
