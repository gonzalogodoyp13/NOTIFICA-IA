import { describe, expect, it } from 'vitest'

import { buildSendPreview, buildAttachmentFilename, isValidEmail } from '../../lib/recibos/send-core'
import type { ReceiptListRow } from '../../lib/recibos/query'
import type { ReceiptFiltersInput } from '../../lib/validations/recibos'

const filters: ReceiptFiltersInput = {
  abogadoIds: [],
  procuradorIds: [],
  bancoIds: [],
  estados: [],
  estampoTemplates: [],
  boletaMatch: 'contains',
  fechaEjecucionDesde: '2026-06-01',
  fechaEjecucionHasta: '2026-06-30',
  page: 1,
  pageSize: 25,
}

function row(overrides: Partial<ReceiptListRow>): ReceiptListRow {
  return {
    reciboId: 'recibo-1',
    createdAt: '2026-06-10T12:00:00.000Z',
    rolId: 'rol-1',
    documentoId: 'doc-1',
    notificacionId: null,
    numeroRecibo: 'R-1',
    rol: 'C-1-2026',
    tribunal: 'Tribunal',
    caratula: 'Banco con Cliente',
    gestion: 'Notificacion',
    estampoTemplate: 'Template',
    estampoTemplateKey: 'wizard:1',
    resultado: 'POSITIVA',
    abogadoId: 10,
    abogado: 'Abogada Uno',
    abogadoEmail: 'abogada@example.com',
    procuradorId: 20,
    procurador: 'Procurador Uno',
    procuradorEmail: 'procurador@example.com',
    banco: 'Banco',
    valor: 15000,
    fechaRecibo: '2026-06-10T12:00:00.000Z',
    fechaEjecucion: '2026-06-10T12:00:00.000Z',
    fechaPago: null,
    estado: 'Sin pagar',
    numeroBoleta: '-',
    ...overrides,
  }
}

describe('receipt send center core', () => {
  it('groups by procurador and totals only that recipient rows', () => {
    const preview = buildSendPreview({
      rows: [
        row({ reciboId: 'a', valor: 1000, procuradorId: 20, procurador: 'Proc A' }),
        row({ reciboId: 'b', valor: 2500, procuradorId: 20, procurador: 'Proc A' }),
        row({ reciboId: 'c', valor: 3000, procuradorId: 21, procurador: 'Proc B', procuradorEmail: null }),
      ],
      filters,
      recipientMode: 'procurador',
    })

    expect(preview.groups).toHaveLength(2)
    expect(preview.groups[0].reciboCount).toBe(2)
    expect(preview.groups[0].totalAmount).toBe(3500)
    expect(preview.groups[1].warnings).toContain('Procurador sin email: Proc B')
    expect(preview.groups[1].canSend).toBe(false)
  })

  it('groups ambos by abogado/procurador pair and allows one valid email', () => {
    const preview = buildSendPreview({
      rows: [row({ abogadoEmail: null, procuradorEmail: 'proc@example.com' })],
      filters,
      recipientMode: 'ambos',
    })

    expect(preview.groups).toHaveLength(1)
    expect(preview.groups[0].recipientType).toBe('Ambos')
    expect(preview.groups[0].recipients).toHaveLength(2)
    expect(preview.groups[0].canSend).toBe(true)
    expect(preview.groups[0].warnings).toContain('Abogado sin email: Abogada Uno')
  })

  it('aggregates excluded rows by missing recipient reason', () => {
    const preview = buildSendPreview({
      rows: [row({ reciboId: 'missing', procuradorId: null, procurador: '-', procuradorEmail: null })],
      filters,
      recipientMode: 'procurador',
    })

    expect(preview.groups).toHaveLength(0)
    expect(preview.excluded).toEqual([{
      reason: 'Sin procurador asociado.',
      count: 1,
      rows: [{ reciboId: 'missing', numeroRecibo: 'R-1', rol: 'C-1-2026', reason: 'Sin procurador asociado.' }],
    }])
  })

  it('sanitizes filenames and falls back on missing dates', () => {
    expect(buildAttachmentFilename({
      recipientType: 'Procurador',
      recipientName: 'José / Núñez Ltda.',
      filters: { fechaEjecucionDesde: undefined, fechaEjecucionHasta: undefined },
    })).toBe('Listado-Diligencias-Procurador-Jose-Nunez-Ltda-inicio-a-hoy.xlsx')
  })

  it('uses basic email validation', () => {
    expect(isValidEmail('persona@example.com')).toBe(true)
    expect(isValidEmail('persona@')).toBe(false)
  })
})
