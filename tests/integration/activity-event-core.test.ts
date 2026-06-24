import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

import {
  defaultActivityDescription,
  deletionSnapshot,
  editedFieldsMetadata,
  sanitizeActivityMetadata,
} from '../../lib/audit/activityEventCore'

describe('activity event core', () => {
  it('removes forbidden content and masks sensitive strings', () => {
    const sanitized = sanitizeActivityMetadata({
      q: 'C-123 secret search',
      query: 'Banco Estado',
      searchText: 'persona buscada',
      body: 'correo completo',
      subject: 'asunto real',
      pdfBase64: 'JVBERi0x',
      generationVariables: { nombre: 'Variable sensible' },
      recipientEmail: 'persona@example.com',
      rut: '12345678-9',
      phone: '987654321',
      safeCount: 3,
    }) as Record<string, unknown>

    expect(sanitized).not.toHaveProperty('q')
    expect(sanitized).not.toHaveProperty('query')
    expect(sanitized).not.toHaveProperty('searchText')
    expect(sanitized).not.toHaveProperty('body')
    expect(sanitized).not.toHaveProperty('subject')
    expect(sanitized).not.toHaveProperty('pdfBase64')
    expect(sanitized).not.toHaveProperty('generationVariables')
    expect(sanitized.recipientEmail).toBe('pe*****@example.com')
    expect(sanitized.rut).toBe('[RUT oculto]')
    expect(sanitized.phone).toBe('[Telefono oculto]')
    expect(sanitized.safeCount).toBe(3)
  })

  it('caps arrays and stores edited field labels without values', () => {
    const capped = sanitizeActivityMetadata({
      receiptIds: Array.from({ length: 150 }, (_, index) => `recibo-${index}`),
    }) as { receiptIds: string[] }

    expect(capped.receiptIds).toHaveLength(100)
    expect(editedFieldsMetadata(['numeroBoleta', 'fechaPago', 'numeroBoleta'])).toEqual({
      editedFields: [
        { field: 'fechaPago', label: 'Fecha de pago' },
        { field: 'numeroBoleta', label: 'Numero de boleta' },
      ],
    })
  })

  it('creates delete snapshots with only the approved fields', () => {
    expect(deletionSnapshot({
      recordType: 'Documento',
      recordId: 'doc_1',
      rol: 'C-123-2026',
      shortName: 'Recibo R-2026-000001',
      userId: 'user_1',
      timestamp: new Date('2026-06-23T12:00:00.000Z'),
    })).toEqual({
      deletedRecord: {
        recordType: 'Documento',
        recordId: 'doc_1',
        rol: 'C-123-2026',
        shortName: 'Recibo R-2026-000001',
        userId: 'user_1',
        timestamp: '2026-06-23T12:00:00.000Z',
      },
    })
  })

  it('keeps Spanish descriptions stable', () => {
    expect(defaultActivityDescription({ eventType: 'auth.login', result: 'success' })).toBe('Inicio de sesion exitoso.')
    expect(defaultActivityDescription({ eventType: 'document.download', result: 'success', shortName: 'Recibo' })).toBe('Documento descargado: Recibo.')
  })

  it('does not use the deprecated login audit endpoint', () => {
    const root = process.cwd()
    const loginPage = readFileSync(join(root, 'app/login/page.tsx'), 'utf8')
    const signinPage = readFileSync(join(root, 'app/signin/page.tsx'), 'utf8')

    expect(loginPage).not.toContain("fetch('/api/log'")
    expect(signinPage).not.toContain("fetch('/api/log'")
    expect(loginPage).toContain('/api/activity/auth/login')
    expect(signinPage).toContain('/api/activity/auth/login')
  })
})
