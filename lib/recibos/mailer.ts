import 'server-only'

import nodemailer from 'nodemailer'

import { sendWithRetries } from '@/lib/recibos/mail-retry'

export type MailAttachment = {
  filename: string
  content: Buffer
  contentType: string
}

export type MailMessage = {
  to: string[]
  subject: string
  text: string
  attachments: MailAttachment[]
}

export type MailSendResult = {
  provider: string
  messageId: string
  threadId?: string | null
  internetMessageId?: string | null
}

export interface MailAdapter {
  provider: string
  fromAccount: string
  send(message: MailMessage): Promise<MailSendResult>
}

function fromEmail() {
  return process.env.MAIL_FROM_EMAIL?.trim() || process.env.GMAIL_SMTP_USER?.trim() || process.env.MS_GRAPH_SENDER_EMAIL?.trim() || 'no-reply@notifica.local'
}

function fromName() {
  return process.env.MAIL_FROM_NAME?.trim() || 'NOTIFICA IA'
}

function dryRunAdapter(): MailAdapter {
  return {
    provider: 'dry-run',
    fromAccount: fromEmail(),
    async send(message) {
      return {
        provider: 'dry-run',
        messageId: `dry-run-${Date.now()}-${message.to.join('-')}`,
        threadId: null,
        internetMessageId: null,
      }
    },
  }
}

function gmailSmtpAdapter(): MailAdapter {
  const user = process.env.GMAIL_SMTP_USER?.trim()
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD?.trim()
  if (!user || !pass) throw new Error('Faltan GMAIL_SMTP_USER y GMAIL_SMTP_APP_PASSWORD.')
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  })
  return {
    provider: 'gmail_smtp',
    fromAccount: fromEmail(),
    async send(message) {
      const result = await transport.sendMail({
        from: `"${fromName()}" <${fromEmail()}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        attachments: message.attachments,
      })
      return { provider: 'gmail_smtp', messageId: result.messageId, threadId: null, internetMessageId: result.messageId }
    },
  }
}

export async function graphAccessToken() {
  const tenantId = process.env.MS_GRAPH_TENANT_ID?.trim()
  const clientId = process.env.MS_GRAPH_CLIENT_ID?.trim()
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET?.trim()
  if (!tenantId || !clientId || !clientSecret) throw new Error('Faltan credenciales MS_GRAPH para enviar correos.')
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, { method: 'POST', body })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.access_token) throw new Error('No se pudo autenticar con Microsoft Graph.')
  return String(payload.access_token)
}

function microsoftGraphAdapter(): MailAdapter {
  const sender = process.env.MS_GRAPH_SENDER_EMAIL?.trim() || process.env.MAIL_FROM_EMAIL?.trim()
  if (!sender) throw new Error('Falta MS_GRAPH_SENDER_EMAIL o MAIL_FROM_EMAIL.')
  return {
    provider: 'microsoft_graph',
    fromAccount: sender,
    async send(message) {
      const accessToken = await graphAccessToken()
      const createResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'IdType="ImmutableId"' },
        body: JSON.stringify({
          subject: message.subject,
          body: { contentType: 'Text', content: message.text },
          toRecipients: message.to.map(address => ({ emailAddress: { address } })),
          attachments: message.attachments.map(attachment => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: attachment.filename,
            contentType: attachment.contentType,
            contentBytes: attachment.content.toString('base64'),
          })),
        }),
      })
      const created = await createResponse.json().catch(() => null)
      if (!createResponse.ok || !created?.id) throw new Error('Microsoft Graph rechazo la preparacion del correo.')
      const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/messages/${encodeURIComponent(created.id)}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'IdType="ImmutableId"' },
      })
      if (!sendResponse.ok) throw new Error('Microsoft Graph rechazo el envio del correo.')
      return {
        provider: 'microsoft_graph',
        messageId: String(created.id),
        threadId: created.conversationId ? String(created.conversationId) : null,
        internetMessageId: created.internetMessageId ? String(created.internetMessageId) : null,
      }
    },
  }
}

export function createMailAdapter(): MailAdapter {
  const provider = process.env.MAIL_PROVIDER?.trim() || 'dry-run'
  if (provider === 'gmail_smtp') return gmailSmtpAdapter()
  if (provider === 'microsoft_graph') return microsoftGraphAdapter()
  return dryRunAdapter()
}

export { sendWithRetries }
