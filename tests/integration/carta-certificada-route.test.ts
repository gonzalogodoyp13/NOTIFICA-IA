import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ find: vi.fn(), upload: vi.fn(), transaction: vi.fn(), create: vi.fn(), version: vi.fn(), update: vi.fn(), event: vi.fn() }))
vi.mock('@/lib/api/server', () => ({
  ApiError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message) } },
  parseApiInput: (schema: any, data: unknown) => schema.parse(data),
  apiSuccess: (data: unknown) => Response.json({ ok: true, data }),
  withApiUser: async (_req: unknown, _op: string, fn: any) => fn({ id: 'user', officeId: 7, officeCacheRevision: 1, officeName: 'Receptor' }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { rolCausa: { findFirst: mocks.find }, $transaction: mocks.transaction } }))
vi.mock('@/lib/documents/storage', () => ({ uploadPdfToDocumentStorage: mocks.upload }))
vi.mock('@/lib/pdf/officeConfig', () => ({ loadOfficePdfConfig: async () => ({ receptorNombre: 'Receptor', receptorDireccionLinea: 'Dirección oficina' }) }))
vi.mock('@/lib/audit/outbox', () => ({ enqueueExternalEvent: mocks.event, processActivityOutbox: async () => {} }))
import { POST } from '@/app/api/roles/[id]/carta-certificada/route'

const request = (overrides = {}) => POST(new NextRequest('http://localhost/api/roles/rol/carta-certificada', {
  method: 'POST', body: JSON.stringify({ ejecutadoId: 'a', direccionEjecutadoId: 'b', fecha: '2026-11-19', formato: 'art44', ...overrides }),
}), { params: Promise.resolve({ id: 'rol' }) })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.find.mockResolvedValue({ id: 'rol', rol: 'C-123-2026', tribunal: { nombre: 'Tribunal' }, demanda: { caratula: 'Banco / Persona', ejecutados: [
    { id: 'a', nombre: 'Demandado A' }, { id: 'b', nombre: 'Demandado B', direccion: 'Otra dirección', comunas: { nombre: 'Santiago' } },
  ] } })
  mocks.upload.mockResolvedValue({ storageKey: 'pdf', storageBucket: 'documents' })
  mocks.version.mockResolvedValue({ id: 'version' })
  mocks.update.mockResolvedValue({ id: 'doc', nombre: 'Carta certificada Demandado A' })
  mocks.transaction.mockImplementation(fn => fn({ documento: { create: mocks.create, update: mocks.update }, documentoVersion: { create: mocks.version } }))
})

it('scopes the role to the office and saves a version for an independently selected address', async () => {
  const response = await request()
  expect(mocks.find.mock.calls[0][0].where).toEqual({ id: 'rol', officeId: 7 })
  expect((await response.json()).data.id).toBe('doc')
  expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ officeId: 7, rolId: 'rol', pdfBase64: expect.any(String) }))
  expect(mocks.version).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdByUserId: 'user' }) }))
  expect(mocks.event).toHaveBeenCalledOnce()
})
it('rejects a defendant or address outside the role', async () => {
  await expect(request({ ejecutadoId: 'foreign' })).rejects.toMatchObject({ status: 400 })
  await expect(request({ direccionEjecutadoId: 'foreign' })).rejects.toMatchObject({ status: 400 })
  expect(mocks.upload).not.toHaveBeenCalled()
})
it('does not create a visible document when upload fails', async () => {
  mocks.upload.mockRejectedValue(new Error('Storage unavailable'))
  await expect(request()).rejects.toThrow('Storage unavailable')
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('rejects inaccessible roles before uploading', async () => {
  mocks.find.mockResolvedValue(null)
  await expect(request()).rejects.toMatchObject({ status: 404 })
  expect(mocks.upload).not.toHaveBeenCalled()
})
