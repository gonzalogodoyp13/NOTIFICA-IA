export type FinalDeliveryAttemptStatus = 'SENT' | 'PARTIAL' | 'FAILED' | 'NO_RECIPIENTS'

export function isValidReportIdempotencyKey(value: string | null | undefined) {
  return /^[A-Za-z0-9:_-]{16,200}$/.test(value?.trim() ?? '')
}

export function finalDeliveryAttemptStatus(input: { intended: number; sent: number }): FinalDeliveryAttemptStatus {
  if (input.intended <= 0) return 'NO_RECIPIENTS'
  if (input.sent >= input.intended) return 'SENT'
  if (input.sent > 0) return 'PARTIAL'
  return 'FAILED'
}

export function versionIdsToPrune<T extends { id: string; versionNumber: number }>(
  readyVersions: T[],
  currentVersionId: string | null,
  previousVersionLimit = 10
) {
  return readyVersions
    .filter(version => version.id !== currentVersionId)
    .sort((left, right) => right.versionNumber - left.versionNumber)
    .slice(Math.max(0, previousVersionLimit))
    .map(version => version.id)
}

export function shouldSwitchCurrentVersion(candidateVersionNumber: number, currentVersionNumber: number | null | undefined) {
  return currentVersionNumber === null || currentVersionNumber === undefined || candidateVersionNumber > currentVersionNumber
}
