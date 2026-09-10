import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { SigningItemStatus, SigningJobStatus } from '@prisma/client'
import { aggregateJobStatus, assertItemTransition, assertJobTransition, CreateSigningJobSchema, safeSigningError, assertEligibleVersion } from '../../lib/signing/core'
import { validateCatalogEvent } from '../../lib/audit/catalog'

describe('signing domain contracts', () => {
  const expected: Record<SigningItemStatus, SigningItemStatus[]> = {
    QUEUED: ['CLAIMED', 'FAILED', 'CANCELLED'], CLAIMED: ['SIGNING', 'QUEUED', 'RETRY_PENDING', 'WAITING_FOR_OPERATOR', 'FAILED', 'CANCELLED'],
    SIGNING: ['COMPLETED', 'RETRY_PENDING', 'WAITING_FOR_OPERATOR', 'FAILED'], RETRY_PENDING: ['CLAIMED', 'FAILED', 'CANCELLED'],
    WAITING_FOR_OPERATOR: ['QUEUED', 'CANCELLED'], FAILED: ['QUEUED'], COMPLETED: [], CANCELLED: [],
  }
  const jobs: Record<SigningJobStatus, SigningJobStatus[]> = {
    QUEUED: ['RUNNING', 'WAITING_FOR_OPERATOR', 'PARTIAL', 'FAILED', 'CANCELLED'],
    RUNNING: ['QUEUED', 'WAITING_FOR_OPERATOR', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'],
    WAITING_FOR_OPERATOR: ['QUEUED', 'RUNNING', 'PARTIAL', 'FAILED', 'CANCELLED'],
    PARTIAL: ['QUEUED'], FAILED: ['QUEUED'], COMPLETED: [], CANCELLED: [],
  }
  for (const from of Object.values(SigningJobStatus)) for (const to of Object.values(SigningJobStatus)) {
    it(`job ${from} -> ${to} is ${jobs[from].includes(to) ? 'allowed' : 'forbidden'}`, () => {
      if (jobs[from].includes(to)) expect(() => assertJobTransition(from, to)).not.toThrow()
      else expect(() => assertJobTransition(from, to)).toThrow('INVALID_JOB_TRANSITION')
    })
  }
  for (const from of Object.values(SigningItemStatus)) {
    for (const to of Object.values(SigningItemStatus)) {
      it(`${from} -> ${to} is ${expected[from].includes(to) ? 'allowed' : 'forbidden'}`, () => {
        if (expected[from].includes(to)) expect(() => assertItemTransition(from, to)).not.toThrow()
        else expect(() => assertItemTransition(from, to)).toThrow('INVALID_TRANSITION')
      })
    }
  }
  it('aggregates complete, pending, active, operator, partial and terminal batches', () => {
    expect(aggregateJobStatus(['COMPLETED', 'COMPLETED'])).toBe('COMPLETED')
    expect(aggregateJobStatus(['COMPLETED', 'FAILED'])).toBe('PARTIAL')
    expect(aggregateJobStatus(['COMPLETED', 'CANCELLED'])).toBe('PARTIAL')
    expect(aggregateJobStatus(['FAILED', 'CANCELLED'])).toBe('FAILED')
    expect(aggregateJobStatus(['CANCELLED', 'CANCELLED'])).toBe('CANCELLED')
    expect(aggregateJobStatus(['COMPLETED', 'RETRY_PENDING'])).toBe('QUEUED')
    expect(aggregateJobStatus(['SIGNING', 'QUEUED'])).toBe('RUNNING')
    expect(aggregateJobStatus(['CLAIMED', 'WAITING_FOR_OPERATOR'])).toBe('RUNNING')
    expect(aggregateJobStatus(['QUEUED', 'WAITING_FOR_OPERATOR'])).toBe('WAITING_FOR_OPERATOR')
    expect(() => aggregateJobStatus([])).toThrow('EMPTY_JOB')
  })
  it('never stores arbitrary errors or retries an incorrect PIN', () => {
    for (const input of ['pin=1234', new Error('password=abc'), 'Bearer private', 'https://user:secret@example.invalid', { code: 'PIN_INCORRECT', pin: '1234' }]) {
      expect(safeSigningError(input)).toEqual({ code: 'UNKNOWN', message: 'Signing failed; review the operation.', retryable: false, operatorRequired: false })
    }
    expect(safeSigningError('PIN_INCORRECT')).toMatchObject({ retryable: false, operatorRequired: true })
    expect(safeSigningError('TSA_UNAVAILABLE')).toMatchObject({ retryable: true })
    expect(safeSigningError('REVOCATION_UNAVAILABLE')).toMatchObject({ retryable: true })
  })
  it('rejects extra credential fields, weak signature levels and malformed fingerprints', () => {
    const input = { idempotencyKey: 'test', sourceVersionIds: ['v1'], signerFingerprint: 'a'.repeat(64) }
    expect(CreateSigningJobSchema.parse(input).requestedLevel).toBe('PADES_LT')
    for (const extra of [{ pin: '1234' }, { requestedLevel: 'PADES_B' }, { signerFingerprint: 'wrong' }, { sourceVersionIds: [] }]) {
      expect(() => CreateSigningJobSchema.parse({ ...input, ...extra })).toThrow()
    }
    expect(() => validateCatalogEvent('signing.claimed', 'documents', { jobId: 'j', pin: '1234' })).toThrow()
  })
  it('rejects foreign, voided, deleted, superseded, missing and non-PDF source versions', () => {
    const valid = { id: 'v', officeId: 1, checksumSha256: 'a'.repeat(64), mimeType: 'application/pdf', sizeBytes: 2,
      storageBucket: 'documents', storageKey: 'x', deletedAt: null,
      documento: { officeId: 1, tipo: 'Estampo', currentVersionId: 'v', voidedAt: null } }
    expect(() => assertEligibleVersion(valid, 1)).not.toThrow()
    expect(() => assertEligibleVersion(valid, 2)).toThrow('NOT_FOUND')
    for (const patch of [{ deletedAt: new Date() }, { sizeBytes: 0 }, { mimeType: 'text/plain' }, { storageKey: '' }, { checksumSha256: 'x' },
      { documento: { ...valid.documento, voidedAt: new Date() } }, { documento: { ...valid.documento, currentVersionId: 'other' } }]) {
      expect(() => assertEligibleVersion({ ...valid, ...patch }, 1)).toThrow('INELIGIBLE_SOURCE')
    }
  })
})
