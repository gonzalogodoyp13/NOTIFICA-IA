import { describe, expect, it } from 'vitest'

import {
  buildTemplatePayload,
  extractTemplateVariables,
  renderSmartRecibosTemplate,
  unknownTemplateVariables,
} from '../../lib/recibos/email-template-core'

const group = {
  recipientName: 'Abogada Uno / Procurador Dos',
  recipientType: 'Ambos' as const,
  reciboCount: 3,
  totalAmount: 45000,
}

describe('smart recibos email templates', () => {
  it('extracts variables and reports unknown variables', () => {
    expect(extractTemplateVariables('Hola {recipient_name}', 'Total {monto_total} {extra}')).toEqual([
      'recipient_name',
      'monto_total',
      'extra',
    ])
    expect(unknownTemplateVariables('Hola {recipient_name} {extra}')).toEqual(['extra'])
  })

  it('renders supported variables and leaves unknown variables untouched', () => {
    const rendered = renderSmartRecibosTemplate({
      subject: 'Listado {recipient_type} {fecha} {extra}',
      body: '{recipient_name}\n{office_name}\n{cantidad_recibos}\n{monto_total}',
      group,
      officeName: 'Oficina Centro',
      now: new Date('2026-06-17T12:00:00.000Z'),
    })

    expect(rendered.subject).toBe('Listado Ambos 17-06-2026 {extra}')
    expect(rendered.body).toContain('Abogada Uno / Procurador Dos')
    expect(rendered.body).toContain('Oficina Centro')
    expect(rendered.body).toContain('3')
    expect(rendered.body).toContain('$45.000')
    expect(rendered.unknownVariables).toEqual(['extra'])
  })

  it('builds fallback/saved template payload metadata', () => {
    expect(buildTemplatePayload({ subject: 'A {x}', body: 'B', source: 'fallback' })).toMatchObject({
      key: 'SMART_RECIBOS',
      source: 'fallback',
      unknownVariables: ['x'],
    })
  })
})
