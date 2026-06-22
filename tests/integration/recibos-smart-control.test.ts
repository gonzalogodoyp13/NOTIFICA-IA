import { describe, expect, it } from 'vitest'

import {
  businessDaysBetween,
  deriveOperationalState,
  healthState,
  overlappingReciboIds,
  requiresResolutionNote,
  suggestReplyClassification,
} from '../../lib/recibos/smart-control-core'

describe('smart recibos control center', () => {
  it('detects unique overlapping recibos in a listado', () => {
    expect(overlappingReciboIds(['a', 'b', 'b', 'c'], ['b', 'd'])).toEqual(['b'])
    expect(overlappingReciboIds(['a'], ['b'])).toEqual([])
  })

  it('classifies payment before generic receipt language', () => {
    expect(suggestReplyClassification('Recibido', 'Adjunto comprobante de pago')).toBe('pago_informado')
    expect(suggestReplyClassification('Error', 'Favor corregir los datos')).toBe('requiere_correccion')
    expect(suggestReplyClassification('Observacion', 'Se debe revisar')).toBe('observado')
    expect(suggestReplyClassification('Gracias', 'Listado recibido conforme')).toBe('recibido')
    expect(suggestReplyClassification('Consulta', 'Tengo una duda')).toBe('otro')
  })

  it('counts weekdays and excludes weekends', () => {
    expect(businessDaysBetween(new Date(2026, 5, 19), new Date(2026, 5, 26))).toBe(5)
    expect(businessDaysBetween(new Date(2026, 5, 20), new Date(2026, 5, 22))).toBe(1)
  })

  it('derives waiting, overdue, replied, resolved, failed and test states', () => {
    const base = { status: 'sent', provider: 'gmail_smtp', dispatchKind: 'standard', sentAt: new Date(2026, 5, 1), replyCount: 0, resolvedAt: null, now: new Date(2026, 5, 3) }
    expect(deriveOperationalState(base)).toBe('waiting')
    expect(deriveOperationalState({ ...base, now: new Date(2026, 5, 12) })).toBe('overdue')
    expect(deriveOperationalState({ ...base, replyCount: 1 })).toBe('replied')
    expect(deriveOperationalState({ ...base, resolvedAt: new Date() })).toBe('resolved')
    expect(deriveOperationalState({ ...base, status: 'failed' })).toBe('failed')
    expect(deriveOperationalState({ ...base, dispatchKind: 'test' })).toBe('sent')
    expect(deriveOperationalState({ ...base, provider: 'dry-run' })).toBe('sent')
  })

  it('requires notes only for actionable reply classifications', () => {
    expect(requiresResolutionNote('observado')).toBe(true)
    expect(requiresResolutionNote('requiere_correccion')).toBe(true)
    expect(requiresResolutionNote('recibido')).toBe(false)
  })

  it('derives provider health states without exposing credentials', () => {
    expect(healthState({ enabled: false, configured: false })).toBe('disabled')
    expect(healthState({ enabled: true, configured: false })).toBe('misconfigured')
    expect(healthState({ enabled: true, configured: true, lastError: 'timeout' })).toBe('degraded')
    expect(healthState({ enabled: true, configured: true, lastHealthyAt: new Date() })).toBe('healthy')
    expect(healthState({ enabled: true, configured: true })).toBe('unknown')
  })
})
