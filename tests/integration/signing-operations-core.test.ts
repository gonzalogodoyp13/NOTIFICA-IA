import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { safeSigningError, retryDelayMs, aggregateJobStatus } from '../../lib/signing/core'
import { deliveryCanRetry, deliveryDelayMs } from '../../lib/signing/operationsPolicy'
import { maintenanceAuthorized } from '../../lib/signing/maintenance'
import { Heartbeat } from '../../lib/signing/deviceProtocol'
import { signingLog } from '../../lib/signing/telemetry'
import { NextRequest } from 'next/server'
import { GET as maintenanceGet } from '../../app/api/internal/signing/maintenance/route'
import { createDeviceHandler } from '../../lib/signing/deviceHttp'

describe('Phase 10 failure and retention boundaries', () => {
  it.each(['download', 'delivery-download'])('correlates successful binary %s responses without logging bytes', async action => {
    const bytes = Buffer.from('%PDF-private-document')
    const service = { throttle: vi.fn(), limitAuthenticated: vi.fn(), download: vi.fn(async () => bytes), downloadDelivery: vi.fn(async () => bytes) }
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const response = await createDeviceHandler(service as unknown as Parameters<typeof createDeviceHandler>[0])(
        new NextRequest('https://localhost/api/signing/device/' + action, { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + 'a'.repeat(43) }, body: '{}' }), action)
      expect(response.status).toBe(200)
      const correlationId = response.headers.get('x-signing-correlation-id')
      expect(correlationId).toMatch(/^[a-f0-9-]{36}$/)
      expect(JSON.parse(log.mock.calls[0][0]).correlationId).toBe(correlationId)
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-document')
      expect(await response.text()).toBe(bytes.toString())
    } finally { log.mockRestore() }
  })
  it.each(['NETWORK', 'STORAGE', 'TSA_UNAVAILABLE', 'REVOCATION_UNAVAILABLE', 'VALIDATOR_UNAVAILABLE', 'VALIDATOR_BUSY'])('retries infrastructure %s with a capped delay', code => {
    expect(safeSigningError(code).retryable).toBe(true)
    expect([1, 2, 3, 20].map(retryDelayMs)).toEqual([5000, 10000, 20000, 300000])
  })
  it.each(['PIN_REQUIRED', 'PIN_INCORRECT', 'PIN_LOCKED', 'PIN_EXPIRED', 'TOKEN_MISSING', 'DRIVER_MISSING', 'DRIVER_ERROR', 'DISK', 'OUTCOME_UNKNOWN'])('requires operator for %s', code => {
    expect(safeSigningError(code)).toMatchObject({ retryable: false, operatorRequired: true })
  })
  it.each(['CERT_EXPIRED', 'CERT_REVOKED', 'VALIDATION_FAILED', 'CHECKSUM_MISMATCH', 'UNKNOWN'])('never automatically retries permanent %s', code => {
    expect(safeSigningError(code).retryable).toBe(false)
  })
  it('limits delivery attempts and distinguishes permanent/disk failure', () => {
    expect(deliveryCanRetry('NETWORK', 5)).toBe(true)
    expect(deliveryCanRetry('NETWORK', 6)).toBe(false)
    for (const code of ['DISK', 'CHECKSUM_MISMATCH', 'LOCAL_CONFLICT', 'UNKNOWN']) expect(deliveryCanRetry(code, 1)).toBe(false)
    expect([1, 2, 20].map(deliveryDelayMs)).toEqual([30000, 60000, 3600000])
  })
  it('reports unfinished partial batches as waiting or queued until remaining work completes', () => {
    expect(aggregateJobStatus(['COMPLETED', 'WAITING_FOR_OPERATOR'])).toBe('WAITING_FOR_OPERATOR')
    expect(aggregateJobStatus(['COMPLETED', 'RETRY_PENDING'])).toBe('QUEUED')
    expect(aggregateJobStatus(['COMPLETED', 'FAILED'])).toBe('PARTIAL')
    expect(aggregateJobStatus(['COMPLETED', 'COMPLETED'])).toBe('COMPLETED')
  })
  it('rejects missing/short/incorrect scheduler credentials', () => {
    expect(maintenanceAuthorized(undefined, null)).toBe(false)
    expect(maintenanceAuthorized('short', 'Bearer short')).toBe(false)
    expect(maintenanceAuthorized('a'.repeat(43), 'Bearer ' + 'b'.repeat(43))).toBe(false)
    expect(maintenanceAuthorized('a'.repeat(43), 'Bearer ' + 'a'.repeat(43))).toBe(true)
  })
  it('rejects anonymous scheduler HTTP calls without invoking database work', async () => {
    const response = await maintenanceGet(new NextRequest('https://localhost/api/internal/signing/maintenance'))
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/)
  })
  it('never serializes arbitrary errors or PIN fields', () => {
    const secret = 'PIN=9876 service_role=PRIVATE'
    expect(JSON.stringify(safeSigningError(secret))).not.toContain(secret)
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      signingLog('device_request', secret, 503, secret)
      expect(JSON.stringify(log.mock.calls)).not.toContain(secret)
      expect(JSON.parse(log.mock.calls[0][0]).errorCode).toBe('UNKNOWN')
    } finally { log.mockRestore() }
    expect(Heartbeat.safeParse({ agentVersion: '0.10.0', role: 'RECEIVER', diskFreeBytes: 0,
      lastSuccessfulContactAt: null, token: 'NOT_APPLICABLE', certificate: null, operationalError: secret }).success).toBe(false)
  })
})
