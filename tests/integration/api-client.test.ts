import { describe, expect, it } from 'vitest'

import { readApiError } from '../../lib/api/client'

describe('readApiError', () => {
  it('reads structured API errors', async () => {
    const response = new Response(JSON.stringify({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Revisa los datos ingresados',
        fields: { rol: ['Requerido'] },
      },
    }), { status: 400 })

    await expect(readApiError(response, 'Fallback')).resolves.toBe('Revisa los datos ingresados')
  })

  it('accepts legacy string errors while routes migrate', async () => {
    const response = new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), { status: 401 })

    await expect(readApiError(response, 'Fallback')).resolves.toBe('No autorizado')
  })

  it('returns fallback for non-json responses', async () => {
    const response = new Response('not json', { status: 500 })

    await expect(readApiError(response, 'Fallback')).resolves.toBe('Fallback')
  })
})

