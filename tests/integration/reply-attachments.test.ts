import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ token: vi.fn(), connect: vi.fn(), mailboxOpen: vi.fn(), search: vi.fn(), fetchOne: vi.fn(), logout: vi.fn(), parse: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/server', () => ({ ApiError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message) } } }))
vi.mock('@/lib/recibos/mailer', () => ({ graphAccessToken: mock.token }))
vi.mock('imapflow', () => ({ ImapFlow: class { connect = mock.connect; mailboxOpen = mock.mailboxOpen; search = mock.search; fetchOne = mock.fetchOne; logout = mock.logout } }))
vi.mock('mailparser', () => ({ simpleParser: mock.parse }))
import { downloadReplyAttachment } from '@/lib/recibos/reply-attachments'
const reply = { provider: 'microsoft_graph', mailboxAddress: 'office@example.test', providerMessageId: 'message/id', internetMessageId: '<message@example.test>' }
const file = { providerAttachmentId: 'attachment/id', byteSize: 8 }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MS_GRAPH_SENDER_EMAIL', reply.mailboxAddress)
  vi.stubEnv('GMAIL_IMAP_USER', reply.mailboxAddress)
  vi.stubEnv('GMAIL_IMAP_APP_PASSWORD', 'test')
  mock.token.mockResolvedValue('test-token')
  mock.logout.mockResolvedValue(undefined)
  mock.mailboxOpen.mockResolvedValue({ uidValidity: 123 })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('original mailbox attachment retrieval', () => {
  it('fetches exact Graph bytes with encoded persisted IDs', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('original'))
    vi.stubGlobal('fetch', fetch)
    expect((await downloadReplyAttachment(reply, file)).toString()).toBe('original')
    expect(fetch.mock.calls[0][0]).toContain('messages/message%2Fid/attachments/attachment%2Fid/$value')
  })
  it('rejects a changed mailbox, missing attachment identity and oversized files before provider access', async () => {
    await expect(downloadReplyAttachment({ ...reply, mailboxAddress: 'other@example.test' }, file)).rejects.toMatchObject({ status: 409 })
    await expect(downloadReplyAttachment(reply, { ...file, providerAttachmentId: null })).rejects.toMatchObject({ status: 409 })
    await expect(downloadReplyAttachment(reply, { ...file, byteSize: 21 * 1024 * 1024 })).rejects.toMatchObject({ status: 413 })
    expect(mock.token).not.toHaveBeenCalled()
  })
  it('handles unavailable Graph messages without returning provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('provider internal detail', { status: 404 })))
    await expect(downloadReplyAttachment(reply, file)).rejects.toMatchObject({ status: 502, message: 'No se pudo recuperar el adjunto del buzón original.' })
  })
  it('matches Gmail attachment by stored checksum and logs out', async () => {
    mock.search.mockResolvedValue([7])
    mock.fetchOne.mockResolvedValueOnce({ size: 100 }).mockResolvedValueOnce({ source: Buffer.from('mime') })
    mock.parse.mockResolvedValue({ attachments: [{ checksum: 'wrong', content: Buffer.from('wrong') }, { checksum: file.providerAttachmentId, content: Buffer.from('correct') }] })
    expect((await downloadReplyAttachment({ ...reply, provider: 'gmail_smtp' }, file)).toString()).toBe('correct')
    expect(mock.mailboxOpen).toHaveBeenCalledWith('INBOX', { readOnly: true })
    expect(mock.logout).toHaveBeenCalledOnce()
  })
  it('refuses ambiguous message identities and stale fallback UID validity', async () => {
    mock.search.mockResolvedValue([7, 8])
    await expect(downloadReplyAttachment({ ...reply, provider: 'gmail_smtp' }, file)).rejects.toMatchObject({ status: 404 })
    await expect(downloadReplyAttachment({ ...reply, provider: 'gmail_smtp', internetMessageId: null, providerMessageId: 'imap-999-7' }, file)).rejects.toMatchObject({ status: 404 })
    expect(mock.fetchOne).not.toHaveBeenCalled()
    expect(mock.logout).toHaveBeenCalledTimes(2)
  })
})
