import 'server-only'
import { z } from 'zod'
import type { SignatureLevel, SigningItemStatus, SigningJobStatus } from '@prisma/client'

export const Identifier = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/)
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/)
export const SupportedSigningLevel = z.enum(['PADES_B', 'PADES_LT', 'PADES_LTA'])
const profileRank: Record<SignatureLevel, number> = { PADES_B: 0, PADES_T: 1, PADES_LT: 2, PADES_LTA: 3 }
export function meetsRequestedSigningLevel(actual: SignatureLevel, requested: SignatureLevel) {
  return profileRank[actual] >= profileRank[requested]
}

// Basic signatures need no TSA. Validation and revocation checks remain
// mandatory for every profile; only timestamp evidence is profile-dependent.
export const SigningEvidenceSchema = z.object({
  signedVersionId: Identifier, signedChecksum: Sha256,
  certificateIssuer: z.string().min(1).max(500), providerType: z.string().min(1).max(80),
  signerFingerprint: Sha256, level: SupportedSigningLevel,
  timestampAt: z.date().nullable().default(null), revocationCheckedAt: z.date(), validatedAt: z.date(),
}).strict().superRefine((evidence, ctx) => {
  if (evidence.level !== 'PADES_B' && evidence.timestampAt === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['timestampAt'], message: 'Timestamp evidence is required for this signature level.' })
  }
})
export const SigningContextSchema = z.object({ officeId: z.number().int().positive(), userId: Identifier }).strict()
export type SigningContext = z.infer<typeof SigningContextSchema>
export const CreateSigningJobSchema = z.object({
  idempotencyKey: Identifier,
  signerFingerprint: Sha256,
  sourceVersionIds: z.array(Identifier).min(1).max(500),
  requestedLevel: SupportedSigningLevel.default('PADES_LT'),
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
  AGENT_UPDATE_REQUIRED: ['Update the signing agent before starting new work.', false],
  NETWORK: ['Network temporarily unavailable.', true],
  STORAGE: ['Document storage temporarily unavailable.', true],
  VALIDATOR_UNAVAILABLE: ['Signature validator temporarily unavailable.', true],
  VALIDATOR_BUSY: ['Signature validator is busy.', true],
  TSA_UNAVAILABLE: ['Timestamp service temporarily unavailable.', true],
  REVOCATION_UNAVAILABLE: ['Revocation evidence temporarily unavailable.', true],
  TOKEN_MISSING: ['Connect the signing token.', false],
  DRIVER_MISSING: ['Install the configured token driver.', false],
  DRIVER_ERROR: ['The token driver requires operator attention.', false],
  DISK: ['Check free space and local folder permissions.', false],
  PIN_LOCKED: ['The token PIN is locked. Contact the provider.', false],
  PIN_EXPIRED: ['The token PIN has expired. Local operator action is required.', false],
  PIN_REQUIRED: ['Unlock the local token session by entering its PIN on the signing device.', false],
  PIN_INCORRECT: ['The token PIN was incorrect. Operator action is required on the signing device.', false],
  CERT_EXPIRED: ['The signing certificate has expired.', false],
  CERT_REVOKED: ['The signing certificate has been revoked.', false],
  VALIDATION_FAILED: ['Signature validation failed.', false],
  CHECKSUM_MISMATCH: ['Document checksum verification failed.', false],
  LEASE_EXPIRED: ['The signing lease expired.', false],
  OUTCOME_UNKNOWN: ['The signing outcome requires operator review before another token operation.', false],
  UNKNOWN: ['Signing failed; review the operation.', false],
} as const
export function safeSigningError(value: unknown) {
  const code = typeof value === 'string' && Object.hasOwn(ERRORS, value) ? value as keyof typeof ERRORS : 'UNKNOWN'
  const [message, retryable] = ERRORS[code]
  return { code, message, retryable, operatorRequired: ['AGENT_UPDATE_REQUIRED', 'PIN_REQUIRED', 'PIN_INCORRECT', 'PIN_LOCKED', 'PIN_EXPIRED', 'TOKEN_MISSING', 'DRIVER_MISSING', 'DRIVER_ERROR', 'DISK', 'OUTCOME_UNKNOWN'].includes(code) }
}
export const SigningFailureCode = z.enum(Object.keys(ERRORS) as [keyof typeof ERRORS, ...(keyof typeof ERRORS)[]])

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
