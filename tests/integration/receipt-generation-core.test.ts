import { describe, expect, it } from 'vitest'

import {
  buildExecutionMetadata,
  isValidIdempotencyKey,
  receiptGenerationFingerprint,
  receiptRequestHash,
} from '../../lib/recibos/generation-core'
import { ReciboGenerateSchema } from '../../lib/validations/rol-workspace'

const input = ReciboGenerateSchema.parse({
  notificacionId: 'notification-1',
  bancoId: 7,
  operation: 'GENERATE',
  ejecucion: { fecha: '2026-07-30', hora: '14:15' },
  estampoTipo: { kind: 'CUSTOM', estampoId: 'stamp-1' },
  monto: 25000,
  medio: 'TRANSFERENCIA',
  referencia: 'OP-123',
  otros: 1000,
})

describe('receipt generation contract', () => {
  it('builds stable request hashes and excludes the operation from the legal fingerprint', () => {
    const corrected = {
      ...input,
      operation: 'CORRECT' as const,
      correctionReason: 'Correccion legal',
    }
    expect(receiptRequestHash(input)).toHaveLength(64)
    expect(receiptRequestHash(input)).toBe(receiptRequestHash({ ...input }))
    expect(receiptGenerationFingerprint(input)).toBe(receiptGenerationFingerprint(corrected))
  })

  it('writes canonical execution metadata and compatibility mirrors in one payload', () => {
    expect(buildExecutionMetadata(input)).toEqual({
      ejecucion: { fecha: '2026-07-30', hora: '14:15' },
      fechaEjecucion: '2026-07-30T12:00:00.000Z',
      horaEjecucion: '14:15',
      estampoTipo: { kind: 'CUSTOM', estampoId: 'stamp-1' },
      estampoId: 'stamp-1',
      monto: 25000,
    })
  })

  it('requires a correction reason and validates idempotency keys', () => {
    expect(ReciboGenerateSchema.safeParse({ ...input, operation: 'CORRECT' }).success).toBe(false)
    expect(
      ReciboGenerateSchema.safeParse({
        ...input,
        operation: 'CORRECT',
        correctionReason: 'Cambio de datos legales',
      }).success
    ).toBe(true)
    expect(isValidIdempotencyKey('receipt-12345678')).toBe(true)
    expect(isValidIdempotencyKey('short')).toBe(false)
    expect(isValidIdempotencyKey('invalid key with spaces')).toBe(false)
  })
})
