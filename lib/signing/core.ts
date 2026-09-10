import 'server-only'
import { z } from 'zod'
import type { SigningItemStatus, SigningJobStatus } from '@prisma/client'

export const Identifier = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/)
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/)
export const SigningContextSchema = z.object({ officeId: z.number().int().positive(), userId: Identifier }).strict()
export type SigningContext = z.infer<typeof SigningContextSchema>
export const CreateSigningJobSchema = z.object({
  idempotencyKey: Identifier,
  signerFingerprint: Sha256,
  sourceVersionIds: z.array(Identifier).min(1).max(500),
  requestedLevel: z.enum(['PADES_LT', 'PADES_LTA']).default('PADES_LT'),
  maxAttempts: z.number().int().min(1).max(20).default(4),
}).strict()

export const LeaseSchema = z.object({
  officeId: z.number().int().positive(), deviceId: Identifier,
  itemId: Identifier, leaseToken: z.string().uuid(),
}).strict()
export type SigningLease = z.infer<typeof LeaseSchema>

export class SigningError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'SigningError' }
}

// Error messages from middleware may contain PINs, URLs or credentials. Never
// persist arbitrary error text: map only exact, recognized codes to fixed text.
const ERRORS = {
  NETWORK: ['Network temporarily unavailable.', true],
  STORAGE: ['Document storage temporarily unavailable.', true],
  TSA_UNAVAILABLE: ['Timestamp service temporarily unavailable.', true],
  REVOCATION_UNAVAILABLE: ['Revocation evidence temporarily unavailable.', true],
  TOKEN_MISSING: ['Connect the signing token.', false],
  DRIVER_MISSING: ['Install the configured token driver.', false],
  PIN_INCORRECT: ['Local operator action is required.', false],
  CERT_EXPIRED: ['The signing certificate has expired.', false],
  VALIDATION_FAILED: ['Signature validation failed.', false],
  CHECKSUM_MISMATCH: ['Document checksum verification failed.', false],
  LEASE_EXPIRED: ['The signing lease expired.', false],
  UNKNOWN: ['Signing failed; review the operation.', false],
} as const
export function safeSigningError(value: unknown) {
  const code = typeof value === 'string' && Object.hasOwn(ERRORS, value) ? value as keyof typeof ERRORS : 'UNKNOWN'
  const [message, retryable] = ERRORS[code]
  return { code, message, retryable, operatorRequired: ['PIN_INCORRECT', 'TOKEN_MISSING', 'DRIVER_MISSING'].includes(code) }
}

export function assertEligibleVersion(version: {
  officeId: number; id: string; checksumSha256: string; mimeType: string;
  sizeBytes: number; storageBucket: string; storageKey: string; deletedAt: Date | null;
  documento: { officeId: number; tipo: string; currentVersionId: string | null; voidedAt: Date | null }
}, officeId: number) {
  if (version.officeId !== officeId || version.documento.officeId !== officeId) throw new SigningError('NOT_FOUND')
  if (version.documento.tipo !== 'Estampo' || version.documento.voidedAt || version.deletedAt ||
    version.documento.currentVersionId !== version.id || version.mimeType !== 'application/pdf' ||
    version.sizeBytes <= 0 || !version.storageBucket || !version.storageKey || !Sha256.safeParse(version.checksumSha256).success) {
    throw new SigningError('INELIGIBLE_SOURCE')
  }
}

export const ITEM_TRANSITIONS: Readonly<Record<SigningItemStatus, readonly SigningItemStatus[]>> = {
  QUEUED: ['CLAIMED', 'FAILED', 'CANCELLED'],
  CLAIMED: ['SIGNING', 'QUEUED', 'RETRY_PENDING', 'WAITING_FOR_OPERATOR', 'FAILED', 'CANCELLED'],
  SIGNING: ['COMPLETED', 'RETRY_PENDING', 'WAITING_FOR_OPERATOR', 'FAILED'],
  RETRY_PENDING: ['CLAIMED', 'FAILED', 'CANCELLED'],
  WAITING_FOR_OPERATOR: ['QUEUED', 'CANCELLED'],
  FAILED: ['QUEUED'],
  COMPLETED: [],
  CANCELLED: [],
}
export function assertItemTransition(from: SigningItemStatus, to: SigningItemStatus) {
  if (!ITEM_TRANSITIONS[from].includes(to)) throw new SigningError('INVALID_TRANSITION')
}
export const JOB_TRANSITIONS: Readonly<Record<SigningJobStatus, readonly SigningJobStatus[]>> = {
  QUEUED: ['RUNNING', 'WAITING_FOR_OPERATOR', 'PARTIAL', 'FAILED', 'CANCELLED'],
  RUNNING: ['QUEUED', 'WAITING_FOR_OPERATOR', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'],
  WAITING_FOR_OPERATOR: ['QUEUED', 'RUNNING', 'PARTIAL', 'FAILED', 'CANCELLED'],
  PARTIAL: ['QUEUED'], FAILED: ['QUEUED'], COMPLETED: [], CANCELLED: [],
}
export function assertJobTransition(from: SigningJobStatus, to: SigningJobStatus) {
  if (!JOB_TRANSITIONS[from].includes(to)) throw new SigningError('INVALID_JOB_TRANSITION')
}
export function aggregateJobStatus(statuses: readonly SigningItemStatus[]): SigningJobStatus {
  if (!statuses.length) throw new SigningError('EMPTY_JOB')
  if (statuses.every(s => s === 'COMPLETED')) return 'COMPLETED'
  if (statuses.some(s => s === 'CLAIMED' || s === 'SIGNING')) return 'RUNNING'
  if (statuses.some(s => s === 'WAITING_FOR_OPERATOR')) return 'WAITING_FOR_OPERATOR'
  if (statuses.some(s => s === 'QUEUED' || s === 'RETRY_PENDING')) return 'QUEUED'
  if (statuses.every(s => s === 'CANCELLED')) return 'CANCELLED'
  if (statuses.some(s => s === 'COMPLETED')) return 'PARTIAL'
  return 'FAILED'
}
export function retryDelayMs(attempt: number) { return Math.min(300_000, 5_000 * 2 ** Math.max(0, attempt - 1)) }
