import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  const model = () => ({ findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn() })
  return { db: { $transaction: vi.fn(), rolCausa: model(), nota: model(), documento: model(), recibo: model(), diligencia: model(), notificacion: model(), recibosDispatchReply: model(), recibosDispatchRecipient: model(), recibosDispatchBatch: model(), recibosDispatchReplyAttachment: model() }, audit: vi.fn(), download: vi.fn() }
})
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.db }))
vi.mock('@/lib/audit/activityEvent', () => ({ recordCriticalEvent: mocks.audit }))
vi.mock('@/lib/recibos/reply-attachments', () => ({ downloadReplyAttachment: mocks.download }))
vi.mock('@/lib/api/server', () => ({
  ApiError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message) } },
  withApiUser: (_req: unknown, _op: unknown, callback: Function) => callback({ id: 'user', officeId: 1 }),
  parseApiInput: (schema: any, value: unknown) => schema.parse(value),
  apiSuccess: (data: unknown) => Response.json({ ok: true, data }),
}))
import { PATCH, GET } from '@/app/api/recibos/send/replies/[replyId]/association/route'
import { GET as download } from '@/app/api/recibos/send/replies/[replyId]/attachments/[attachmentId]/route'
import { POST as addNote, DELETE as deleteNote } from '@/app/api/roles/[id]/notas/route'
import { POST as legacyAddNote, DELETE as legacyDeleteNote } from '@/app/api/notas/route'
import { getReceiptList, parseReceiptFilters } from '@/lib/recibos/query'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.db.$transaction.mockImplementation((callback: Function) => callback(mocks.db))
})
const params = { params: { replyId: 'reply' } }
const request = (body = { recipientId: 'recipient', confirmed: true }) => new NextRequest('http://localhost/api', { method: 'PATCH', body: JSON.stringify(body) })

describe('manual reply association', () => {
  it('rejects foreign or missing replies before reading destinations', async () => {
    mocks.db.recibosDispatchReply.findFirst.mockResolvedValue(null)
    await expect(PATCH(request(), params)).rejects.toMatchObject({ status: 404 })
    expect(mocks.db.recibosDispatchReply.findFirst).toHaveBeenCalledWith({ where: { id: 'reply', officeId: 1 } })
    expect(mocks.db.recibosDispatchRecipient.findFirst).not.toHaveBeenCalled()
  })
  it('requires confirmation and limits searchable destinations to sent same-office/provider records', async () => {
    await expect(PATCH(request({ recipientId: 'recipient', confirmed: false }), params)).rejects.toThrow()
    mocks.db.recibosDispatchReply.findFirst.mockResolvedValue({ id: 'reply', provider: 'gmail_smtp' })
    mocks.db.recibosDispatchRecipient.findMany.mockResolvedValue([])
    await GET(new NextRequest('http://localhost/api?q=Lawyer'), params)
    expect(mocks.db.recibosDispatchRecipient.findMany.mock.calls[0][0]).toMatchObject({ where: { status: 'sent', batch: { officeId: 1, provider: 'gmail_smtp' } }, take: 50 })
  })
  it('rejects unavailable destinations and already-associated replies', async () => {
    mocks.db.recibosDispatchReply.findFirst.mockResolvedValue({ id: 'reply', provider: 'gmail_smtp' })
    mocks.db.recibosDispatchRecipient.findFirst.mockResolvedValue(null)
    await expect(PATCH(request(), params)).rejects.toMatchObject({ status: 404 })
    mocks.db.recibosDispatchRecipient.findFirst.mockResolvedValue({ id: 'recipient', batchId: 'batch' })
    mocks.db.recibosDispatchReply.updateMany.mockResolvedValue({ count: 0 })
    await expect(PATCH(request(), params)).rejects.toMatchObject({ status: 409 })
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('links once, recomputes counts and records the actor in the transaction', async () => {
    mocks.db.recibosDispatchReply.findFirst.mockResolvedValue({ id: 'reply', provider: 'gmail_smtp' })
    mocks.db.recibosDispatchRecipient.findFirst.mockResolvedValue({ id: 'recipient', batchId: 'batch' })
    mocks.db.recibosDispatchReply.updateMany.mockResolvedValue({ count: 1 })
    mocks.db.recibosDispatchReply.aggregate.mockResolvedValue({ _count: { _all: 2 }, _max: { receivedAt: new Date('2026-01-01') } })
    expect((await PATCH(request(), params)).status).toBe(200)
    expect(mocks.db.recibosDispatchReply.updateMany.mock.calls[0][0].where).toMatchObject({ officeId: 1, recipientId: null })
    expect(mocks.db.recibosDispatchRecipient.update.mock.calls[0][0].data.replyCount).toBe(2)
    expect(mocks.audit).toHaveBeenCalledWith(mocks.db, { id: 'user', officeId: 1 }, expect.objectContaining({ eventType: 'receipt.reply_associated' }))
  })
})

describe('reply attachment access', () => {
  it('does not contact the provider for another office attachment', async () => {
    mocks.db.recibosDispatchReplyAttachment.findFirst.mockResolvedValue(null)
    await expect(download(new NextRequest('http://localhost/api'), { params: { replyId: 'reply', attachmentId: 'file' } })).rejects.toMatchObject({ status: 404 })
    expect(mocks.db.recibosDispatchReplyAttachment.findFirst.mock.calls[0][0].where).toEqual({ id: 'file', replyId: 'reply', reply: { officeId: 1 } })
    expect(mocks.download).not.toHaveBeenCalled()
  })
  it('returns original bytes as a private attachment, never inline content', async () => {
    mocks.db.recibosDispatchReplyAttachment.findFirst.mockResolvedValue({ filename: 'comprobante.pdf', reply: {} })
    mocks.download.mockResolvedValue(Buffer.from('original'))
    const result = await download(new NextRequest('http://localhost/api'), { params: { replyId: 'reply', attachmentId: 'file' } })
    expect(await result.text()).toBe('original')
    expect(result.headers.get('Content-Disposition')).toContain('attachment;')
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
  })
})

describe('closed case note protection', () => {
  it.each(['terminado', 'archivado'])('rejects creation and deletion through both APIs for %s', async estado => {
    mocks.db.rolCausa.findFirst.mockResolvedValue({ id: 'role', estado })
    mocks.db.rolCausa.updateMany.mockResolvedValue({ count: 0 })
    mocks.db.nota.findFirst.mockResolvedValue({ id: 'note', rolId: 'role', userId: 'user' })
    const create = () => new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify({ rolId: 'role', contenido: 'New note' }) })
    await expect(addNote(create(), { params: { id: 'role' } })).rejects.toMatchObject({ status: 409 })
    await expect(legacyAddNote(create())).rejects.toMatchObject({ status: 409 })
    await expect(deleteNote(new NextRequest('http://localhost/api?noteId=note'), { params: { id: 'role' } })).rejects.toMatchObject({ status: 409 })
    await expect(legacyDeleteNote(new NextRequest('http://localhost/api?id=note'))).rejects.toMatchObject({ status: 409 })
    expect(mocks.db.nota.create).not.toHaveBeenCalled()
    expect(mocks.db.nota.delete).not.toHaveBeenCalled()
  })
})

it('uses the saved receipt bank and execution dates even when contacts have other banks', async () => {
  mocks.db.documento.findMany.mockResolvedValue([{ id: 'doc' }])
  mocks.db.recibo.count.mockResolvedValue(1)
  mocks.db.recibo.findMany.mockResolvedValue([{ id: 'receipt', rolId: 'role', documentoId: 'doc', monto: 100, createdAt: new Date('2026-03-03'), fechaRecibo: new Date('2026-03-03'), fechaEjecucion: new Date('2026-02-02'), fechaPago: new Date('2026-04-04'), banco: { nombre: 'Chosen bank' }, rol: { rol: 'C-1', demanda: { abogados: { bancos: [{ banco: { nombre: 'Other bank' } }] } } } }])
  const filters = parseReceiptFilters(new URLSearchParams('bancoId=9&fechaEjecucionDesde=2026-02-01&fechaEjecucionHasta=2026-02-28'))
  const result = await getReceiptList(1, filters)
  expect(result.rows[0]).toMatchObject({ banco: 'Chosen bank', fechaEjecucion: '2026-02-02T00:00:00.000Z', fechaRecibo: '2026-03-03T00:00:00.000Z', fechaPago: '2026-04-04T00:00:00.000Z' })
  expect(mocks.db.recibo.findMany.mock.calls[0][0].where).toMatchObject({ bancoId: { in: [9] }, fechaEjecucion: { gte: new Date('2026-02-01'), lte: new Date('2026-02-28T23:59:59.999Z') } })
})
