import 'server-only'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { ApiError } from '@/lib/api/server'
import { graphAccessToken } from '@/lib/recibos/mailer'

type Source = { provider: string; mailboxAddress: string; providerMessageId: string; internetMessageId: string | null }
const MAX_BYTES = 20 * 1024 * 1024

export async function downloadReplyAttachment(reply: Source, attachment: { providerAttachmentId: string | null; byteSize: number | null }) {
  if (!attachment.providerAttachmentId) throw new ApiError('SERVICE_UNAVAILABLE', 'Abre el mensaje original en el buzón para descargar este adjunto.', 409)
  if ((attachment.byteSize ?? 0) > MAX_BYTES) throw new ApiError('VALIDATION_ERROR', 'Descarga los adjuntos mayores de 20 MB desde el buzón original.', 413)
  if (reply.provider === 'microsoft_graph') {
    const mailbox = process.env.MS_GRAPH_SENDER_EMAIL?.trim() || process.env.MAIL_FROM_EMAIL?.trim()
    if (mailbox?.toLowerCase() !== reply.mailboxAddress.toLowerCase()) throw new ApiError('SERVICE_UNAVAILABLE', 'El buzón original ya no está configurado.', 409)
    const token = await graphAccessToken()
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(reply.providerMessageId)}/attachments/${encodeURIComponent(attachment.providerAttachmentId)}/$value`, { headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"' }, cache: 'no-store' })
    if (!response.ok) throw new ApiError('SERVICE_UNAVAILABLE', 'No se pudo recuperar el adjunto del buzón original.', 502)
    const reader = response.body?.getReader()
    if (!reader) throw new ApiError('SERVICE_UNAVAILABLE', 'El adjunto no está disponible.', 502)
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_BYTES) throw new ApiError('VALIDATION_ERROR', 'Descarga este adjunto desde el buzón original.', 413)
        chunks.push(value)
      }
    } finally { await reader.cancel() }
    return Buffer.concat(chunks)
  }
  if (reply.provider !== 'gmail_smtp') throw new ApiError('SERVICE_UNAVAILABLE', 'Proveedor no disponible.', 409)
  const mailbox = process.env.GMAIL_IMAP_USER?.trim() || process.env.GMAIL_SMTP_USER?.trim()
  const password = process.env.GMAIL_IMAP_APP_PASSWORD?.trim() || process.env.GMAIL_SMTP_APP_PASSWORD?.trim()
  if (!mailbox || !password || mailbox.toLowerCase() !== reply.mailboxAddress.toLowerCase()) throw new ApiError('SERVICE_UNAVAILABLE', 'El buzón original ya no está configurado.', 409)
  const client = new ImapFlow({ host: process.env.GMAIL_IMAP_HOST?.trim() || 'imap.gmail.com', port: Number(process.env.GMAIL_IMAP_PORT || 993), secure: process.env.GMAIL_IMAP_SECURE?.trim() !== 'false', auth: { user: mailbox, pass: password }, logger: false })
  await client.connect()
  try {
    const box = await client.mailboxOpen('INBOX', { readOnly: true })
    let uids: number[] = []
    if (reply.internetMessageId) {
      const found = await client.search({ header: { 'Message-ID': reply.internetMessageId } }, { uid: true })
      uids = Array.isArray(found) ? found : []
    } else {
      const match = /^imap-(\d+)-(\d+)$/.exec(reply.providerMessageId)
      if (match && match[1] === String(box.uidValidity)) uids = [Number(match[2])]
    }
    if (uids.length === 1) {
      const meta = await client.fetchOne(uids[0], { size: true }, { uid: true })
      if (meta && (meta.size ?? 0) > MAX_BYTES) throw new ApiError('VALIDATION_ERROR', 'Descarga los adjuntos de este mensaje desde el buzón original.', 413)
      const message = await client.fetchOne(uids[0], { source: true }, { uid: true })
      if (message && message.source) {
        const parsed = await simpleParser(message.source)
        const file = parsed.attachments.find(item => item.checksum === attachment.providerAttachmentId)
        if (file) return file.content
      }
    }
    throw new ApiError('SERVICE_UNAVAILABLE', 'El mensaje o adjunto ya no está en la bandeja de entrada. Revisa el buzón original.', 404)
  } finally { await client.logout().catch(() => undefined) }
}
