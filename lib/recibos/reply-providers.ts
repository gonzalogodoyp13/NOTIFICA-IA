import 'server-only'

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

import { graphAccessToken } from '@/lib/recibos/mailer'
import type { NormalizedReply, ReplyAttachmentMetadata } from '@/lib/recibos/reply-tracking-core'

export type ReplyPollCheckpoint = {
  graphDeltaLink?: string | null
  gmailUidValidity?: string | null
  gmailLastUid?: number | null
}

export type ReplyPollResult = {
  messages: NormalizedReply[]
  checkpoint: ReplyPollCheckpoint
}

export interface ReplyProviderAdapter {
  provider: 'microsoft_graph' | 'gmail_smtp'
  mailboxAddress: string
  poll(checkpoint: ReplyPollCheckpoint, lookbackDays: number): Promise<ReplyPollResult>
}

function htmlToPlainText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function headerMap(headers: Array<{ name?: string; value?: string }> | undefined) {
  return new Map((headers ?? []).map(header => [header.name?.toLowerCase() ?? '', header.value ?? '']))
}

async function graphJson(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'IdType="ImmutableId"',
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Microsoft Graph rechazo la consulta de respuestas.') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return payload
}

async function graphAttachments(sender: string, messageId: string, accessToken: string): Promise<ReplyAttachmentMetadata[]> {
  const payload = await graphJson(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline,contentId`, accessToken)
  return (payload?.value ?? []).map((attachment: any) => ({
    providerAttachmentId: attachment.id ?? null,
    filename: attachment.name || 'adjunto',
    mimeType: attachment.contentType ?? null,
    byteSize: Number.isFinite(attachment.size) ? attachment.size : null,
    contentId: attachment.contentId ?? null,
    isInline: !!attachment.isInline,
  }))
}

export function microsoftGraphReplyAdapter(): ReplyProviderAdapter {
  const mailboxAddress = process.env.MS_GRAPH_SENDER_EMAIL?.trim() || process.env.MAIL_FROM_EMAIL?.trim()
  if (!mailboxAddress) throw new Error('Falta MS_GRAPH_SENDER_EMAIL o MAIL_FROM_EMAIL para revisar respuestas.')
  return {
    provider: 'microsoft_graph',
    mailboxAddress,
    async poll(checkpoint, lookbackDays) {
      const accessToken = await graphAccessToken()
      const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()
      const params = new URLSearchParams({
        '$select': 'id,conversationId,internetMessageId,internetMessageHeaders,from,subject,body,bodyPreview,receivedDateTime,hasAttachments',
        '$filter': `receivedDateTime ge ${since}`,
      })
      const initialUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAddress)}/mailFolders/inbox/messages/delta?${params}`
      const collect = async (startUrl: string, existingDeltaLink: string | null) => {
        let nextUrl: string | null = startUrl
        let deltaLink = existingDeltaLink
        const messages: NormalizedReply[] = []
        let pages = 0
        while (nextUrl && pages < 50) {
          const payload = await graphJson(nextUrl, accessToken)
          for (const item of payload?.value ?? []) {
            if (item['@removed'] || !item.id || !item.from?.emailAddress?.address) continue
            const headers = headerMap(item.internetMessageHeaders)
            const bodyText = item.body?.contentType === 'html' ? htmlToPlainText(item.body.content ?? '') : String(item.body?.content ?? item.bodyPreview ?? '').trim()
            messages.push({
              provider: 'microsoft_graph', mailboxAddress, providerMessageId: item.id,
              providerThreadId: item.conversationId ?? null, internetMessageId: item.internetMessageId ?? null,
              inReplyTo: headers.get('in-reply-to') || null,
              references: (headers.get('references') || '').split(/\s+/).filter(Boolean),
              senderName: item.from.emailAddress.name ?? null, senderEmail: item.from.emailAddress.address,
              subject: item.subject ?? '', bodyText, receivedAt: new Date(item.receivedDateTime),
              attachments: item.hasAttachments ? await graphAttachments(mailboxAddress, item.id, accessToken) : [],
              autoSubmitted: headers.get('auto-submitted') || null,
            })
          }
          nextUrl = payload?.['@odata.nextLink'] ?? null
          deltaLink = payload?.['@odata.deltaLink'] ?? deltaLink
          pages += 1
        }
        return { messages, checkpoint: { graphDeltaLink: deltaLink } }
      }
      try {
        return await collect(checkpoint.graphDeltaLink || initialUrl, checkpoint.graphDeltaLink ?? null)
      } catch (error) {
        const status = (error as Error & { status?: number }).status
        if (checkpoint.graphDeltaLink && status && [400, 404, 410].includes(status)) return collect(initialUrl, null)
        throw error
      }
    },
  }
}

function parsedReferences(value: string | string[] | undefined) {
  if (!value) return []
  return Array.isArray(value) ? value : value.split(/\s+/).filter(Boolean)
}

export function gmailImapReplyAdapter(): ReplyProviderAdapter {
  const mailboxAddress = process.env.GMAIL_IMAP_USER?.trim() || process.env.GMAIL_SMTP_USER?.trim()
  const password = process.env.GMAIL_IMAP_APP_PASSWORD?.trim() || process.env.GMAIL_SMTP_APP_PASSWORD?.trim()
  if (!mailboxAddress || !password) throw new Error('Faltan credenciales de Gmail IMAP para revisar respuestas.')
  const port = Number(process.env.GMAIL_IMAP_PORT || 993)
  return {
    provider: 'gmail_smtp',
    mailboxAddress,
    async poll(checkpoint, lookbackDays) {
      const client = new ImapFlow({
        host: process.env.GMAIL_IMAP_HOST?.trim() || 'imap.gmail.com',
        port: Number.isInteger(port) ? port : 993,
        secure: process.env.GMAIL_IMAP_SECURE?.trim() !== 'false',
        auth: { user: mailboxAddress, pass: password },
        logger: false,
      })
      await client.connect()
      try {
        const mailbox = await client.mailboxOpen('INBOX')
        const uidValidity = String(mailbox.uidValidity)
        const since = new Date(Date.now() - lookbackDays * 86_400_000)
        const searchResult = await client.search({ since }, { uid: true })
        const uids = Array.isArray(searchResult) ? searchResult : []
        const messages: NormalizedReply[] = []
        let highestUid = checkpoint.gmailUidValidity === uidValidity ? checkpoint.gmailLastUid ?? 0 : 0
        if (uids.length) {
          for await (const item of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
            if (!item.source) continue
            const parsed = await simpleParser(item.source)
            const sender = parsed.from?.value[0]
            if (!sender?.address) continue
            highestUid = Math.max(highestUid, item.uid)
            const autoSubmitted = parsed.headers.get('auto-submitted')
            messages.push({
              provider: 'gmail_smtp',
              mailboxAddress,
              providerMessageId: parsed.messageId || `imap-${uidValidity}-${item.uid}`,
              providerThreadId: null,
              internetMessageId: parsed.messageId ?? null,
              inReplyTo: parsed.inReplyTo ?? null,
              references: parsedReferences(parsed.references),
              senderName: sender.name || null,
              senderEmail: sender.address,
              subject: parsed.subject ?? '',
              bodyText: parsed.text?.trim() || (typeof parsed.html === 'string' ? htmlToPlainText(parsed.html) : ''),
              receivedAt: parsed.date ?? new Date(),
              attachments: parsed.attachments.map(attachment => ({
                providerAttachmentId: attachment.checksum ?? null,
                filename: attachment.filename || 'adjunto',
                mimeType: attachment.contentType || null,
                byteSize: attachment.size ?? null,
                contentId: attachment.contentId || null,
                isInline: attachment.contentDisposition === 'inline',
              })),
              autoSubmitted: typeof autoSubmitted === 'string' ? autoSubmitted : null,
            })
          }
        }
        return { messages, checkpoint: { gmailUidValidity: uidValidity, gmailLastUid: highestUid } }
      } finally {
        await client.logout().catch(() => undefined)
      }
    },
  }
}

export function enabledReplyProviders() {
  const adapters: ReplyProviderAdapter[] = []
  if (process.env.MS_GRAPH_REPLY_ENABLED?.trim() === 'true') adapters.push(microsoftGraphReplyAdapter())
  if (process.env.GMAIL_REPLY_ENABLED?.trim() === 'true') adapters.push(gmailImapReplyAdapter())
  return adapters
}
