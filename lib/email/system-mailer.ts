import 'server-only'

import { randomUUID } from 'node:crypto'
import { createMailAdapter, type MailAdapter, type MailMessage } from '@/lib/recibos/mailer'

/** System notifications have their own provider; receipt mailboxes stay independent. */
export function createSystemMailAdapter(): MailAdapter {
  const provider = process.env.SYSTEM_MAIL_PROVIDER?.trim()
  // Preserve existing installations until system mail is explicitly configured.
  if (!provider) return createMailAdapter()
  if (provider === 'dry-run') return {
    provider: 'dry-run',
    fromAccount: process.env.SYSTEM_MAIL_FROM_EMAIL?.trim() || 'contacto@notificaia.cl',
    async send() { return { provider: 'dry-run', messageId: `dry-run-${randomUUID()}` } },
  }
  if (provider !== 'resend') throw new Error('SYSTEM_MAIL_PROVIDER no es válido.')

  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) throw new Error('Falta RESEND_API_KEY para enviar correos del sistema.')
  const fromAccount = process.env.SYSTEM_MAIL_FROM_EMAIL?.trim() || 'contacto@notificaia.cl'
  const fromName = process.env.SYSTEM_MAIL_FROM_NAME?.trim() || 'NOTIFICA IA'
  const requestKeys = new WeakMap<MailMessage, string>()
  return {
    provider: 'resend',
    fromAccount,
    async send(message) {
      const key = message.idempotencyKey || requestKeys.get(message) || randomUUID()
      requestKeys.set(message, key)
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          from: `${fromName} <${fromAccount}>`,
          to: message.to,
          subject: message.subject,
          text: message.text,
          attachments: message.attachments.map(file => ({
            filename: file.filename,
            content: file.content.toString('base64'),
            content_type: file.contentType,
          })),
        }),
      })
      // Provider error bodies can contain sensitive message data; do not persist them.
      if (!response.ok) throw new Error(`Resend rechazó el envío (HTTP ${response.status}).`)
      const payload: unknown = await response.json()
      if (!payload || typeof payload !== 'object' || !('id' in payload) || typeof payload.id !== 'string' || !payload.id) {
        throw new Error('Resend no devolvió un identificador de envío válido.')
      }
      return { provider: 'resend', messageId: payload.id }
    },
  }
}
