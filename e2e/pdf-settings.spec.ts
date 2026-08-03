import { readFileSync } from 'node:fs'
import { expect, request as playwrightRequest, test } from '@playwright/test'

import { AUTH_STATE_PATH, authStateExists } from '../scripts/qa-support'

type PdfSettings = {
  config: { receptorNombre: string | null; receptorDireccionLinea: string | null; receptorTelefono: string | null }
  assets: Record<'firma' | 'sello' | 'reciboStamp', { configured: boolean; previewUrl: string }>
  cacheRevision: number
}

test('admin PDF settings validate, upload, preview, invalidate, and restore', async ({ baseURL }) => {
  expect(authStateExists(), 'Run npm run qa:auth before the PDF settings check.').toBe(true)
  const api = await playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH })
  const initialResponse = await api.get('/api/ajustes/pdf')
  expect(initialResponse.status()).toBe(200)
  const initialPayload = await initialResponse.json()
  const baseline = initialPayload.data as PdfSettings
  expect(Object.values(baseline.assets).every(asset => !asset.configured), 'Guarded QA baseline must use fallback assets.').toBe(true)

  const textFields = {
    receptorNombre: baseline.config.receptorNombre ?? '',
    receptorDireccionLinea: baseline.config.receptorDireccionLinea ?? '',
    receptorTelefono: baseline.config.receptorTelefono ?? '',
  }
  try {
    const malformed = await api.put('/api/ajustes/pdf', {
      multipart: {
        ...textFields,
        firma: { name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('not a png') },
      },
    })
    expect(malformed.status()).toBe(400)

    const conflict = await api.put('/api/ajustes/pdf', {
      multipart: {
        ...textFields,
        firma: { name: 'firma.png', mimeType: 'image/png', buffer: readFileSync('public/mock-firma.png') },
        removeFirma: 'true',
      },
    })
    expect(conflict.status()).toBe(400)

    const updated = await api.put('/api/ajustes/pdf', {
      multipart: {
        receptorNombre: 'QA PDF Settings Test',
        receptorDireccionLinea: 'Direccion QA temporal',
        receptorTelefono: '+56 9 5555 0101',
        firma: { name: 'firma.png', mimeType: 'image/png', buffer: readFileSync('public/mock-firma.png') },
        sello: { name: 'sello.png', mimeType: 'image/png', buffer: readFileSync('public/mock-sello.png') },
        reciboStamp: { name: 'recibo.png', mimeType: 'image/png', buffer: readFileSync('public/mock-sello.png') },
      },
    })
    expect(updated.status(), await updated.text()).toBe(200)
    const updatedPayload = await updated.json()
    expect(updatedPayload.data.cacheRevision).toBeGreaterThan(baseline.cacheRevision)
    const updatedAssets = Object.values(updatedPayload.data.assets) as Array<{ configured: boolean }>
    expect(updatedAssets.every((asset) => asset.configured)).toBe(true)

    for (const kind of ['firma', 'sello', 'reciboStamp']) {
      const preview = await api.get(`/api/ajustes/pdf/assets/${kind}`)
      expect(preview.status()).toBe(200)
      expect(preview.headers()['content-type']).toContain('image/png')
      expect(preview.headers()['cache-control']).toBe('private, no-store')
    }
  } finally {
    const restored = await api.put('/api/ajustes/pdf', {
      multipart: {
        ...textFields,
        removeFirma: 'true',
        removeSello: 'true',
        removeReciboStamp: 'true',
      },
    })
    expect(restored.status(), await restored.text()).toBe(200)
    await api.dispose()
  }
})
