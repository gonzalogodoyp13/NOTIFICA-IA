import { describe, expect, it } from 'vitest'

import {
  deliveryPresentation,
  providerHealthView,
  sendTypeLabel,
  withAdminDiagnostics,
} from '../../lib/recibos/delivery-visibility'

describe('receipt delivery visibility', () => {
  it('labels simulations honestly without exposing the provider identifier', () => {
    expect(deliveryPresentation('dry-run')).toEqual({
      deliveryMode: 'simulation',
      deliveryLabel: 'Simulación (no se envió ningún correo)',
      canSyncReplies: false,
    })
    expect(JSON.stringify(deliveryPresentation('dry-run'))).not.toContain('dry-run')
  })

  it('adds technical metadata only for administrators', () => {
    const safe = { deliveryLabel: 'Envío real', sentCount: 2 }
    const technical = { provider: 'microsoft_graph', messageId: 'message-123', sha256: 'abc123' }

    const ordinary = withAdminDiagnostics(safe, technical, false)
    expect(ordinary).toEqual(safe)
    expect(JSON.stringify(ordinary)).not.toContain('microsoft_graph')
    expect(JSON.stringify(ordinary)).not.toContain('message-123')
    expect(JSON.stringify(ordinary)).not.toContain('abc123')

    expect(withAdminDiagnostics(safe, technical, true)).toEqual({ ...safe, diagnostics: technical })
  })

  it('returns safe provider readiness and gates raw health diagnostics', () => {
    const health = [{
      provider: 'gmail_smtp',
      mailboxAddress: 'correo@example.com',
      enabled: true,
      configured: true,
      status: 'healthy',
      lastCheckedAt: '2026-08-31T12:00:00.000Z',
      lastError: null,
    }]

    const ordinary = providerHealthView(health, false, 'gmail_smtp')
    expect(ordinary.readiness.label).toBe('El servicio de correo está disponible.')
    expect(JSON.stringify(ordinary)).not.toContain('gmail_smtp')
    expect(JSON.stringify(ordinary)).not.toContain('correo@example.com')

    const admin = providerHealthView(health, true, 'gmail_smtp')
    expect(admin.diagnostics?.providers[0]).toMatchObject({ provider: 'gmail_smtp', mailboxAddress: 'correo@example.com' })
  })

  it('uses user-facing Spanish labels for dispatch kinds', () => {
    expect(sendTypeLabel('standard')).toBe('Envío')
    expect(sendTypeLabel('resend')).toBe('Reenvío')
    expect(sendTypeLabel('test')).toBe('Prueba')
  })
})
