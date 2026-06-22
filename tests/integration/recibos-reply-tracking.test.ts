import { describe, expect, it } from 'vitest'

import {
  createTrackingToken,
  extractTrackingToken,
  isAutomaticMessage,
  isReplySyncAuthorized,
  matchReplyToDispatch,
  normalizeReplySubject,
  replyTextPreview,
  subjectWithTrackingToken,
  type DispatchMatchCandidate,
  type NormalizedReply,
} from '../../lib/recibos/reply-tracking-core'

function candidate(overrides: Partial<DispatchMatchCandidate> = {}): DispatchMatchCandidate {
  return {
    id: 'recipient-1',
    provider: 'gmail_smtp',
    providerMessageId: '<outgoing@example.com>',
    providerThreadId: null,
    providerInternetMessageId: '<outgoing@example.com>',
    trackingToken: 'NIA-ABCDEF123456',
    recipientEmails: ['persona@example.com'],
    subject: 'Listado de recibos [NIA-ABCDEF123456]',
    sentAt: new Date('2026-06-18T12:00:00.000Z'),
    ...overrides,
  }
}

function reply(overrides: Partial<NormalizedReply> = {}): NormalizedReply {
  return {
    provider: 'gmail_smtp',
    mailboxAddress: 'shared@example.com',
    providerMessageId: '<reply@example.com>',
    providerThreadId: null,
    internetMessageId: '<reply@example.com>',
    inReplyTo: null,
    references: [],
    senderEmail: 'persona@example.com',
    senderName: 'Persona',
    subject: 'Re: Listado de recibos [NIA-ABCDEF123456]',
    bodyText: 'Recibido, muchas gracias.',
    receivedAt: new Date('2026-06-18T13:00:00.000Z'),
    attachments: [],
    ...overrides,
  }
}

describe('recibos reply tracking', () => {
  it('matches provider threads before other strategies', () => {
    const match = matchReplyToDispatch(reply({ provider: 'microsoft_graph', providerThreadId: 'thread-1' }), [
      candidate({ provider: 'microsoft_graph', providerThreadId: 'thread-1' }),
    ])
    expect(match).toMatchObject({ status: 'matched', recipientId: 'recipient-1', method: 'thread' })
  })

  it('matches In-Reply-To after normalizing angle brackets', () => {
    const match = matchReplyToDispatch(reply({ inReplyTo: 'outgoing@example.com', subject: 'Changed subject', bodyText: 'No token' }), [candidate()])
    expect(match).toMatchObject({ status: 'matched', method: 'in_reply_to' })
  })

  it('matches a unique tracking token when headers are unavailable', () => {
    const match = matchReplyToDispatch(reply({ subject: 'Respuesta [NIA-ABCDEF123456]' }), [candidate()])
    expect(match).toMatchObject({ status: 'matched', method: 'tracking_token', trackingToken: 'NIA-ABCDEF123456' })
  })

  it('uses sender and normalized subject only for a unique candidate', () => {
    const message = reply({ subject: 'RE: Listado de recibos', bodyText: 'Sin token' })
    const one = candidate({ subject: 'Listado de recibos', trackingToken: null })
    expect(matchReplyToDispatch(message, [one])).toMatchObject({ status: 'matched', method: 'sender_subject' })
    expect(matchReplyToDispatch(message, [one, candidate({ id: 'recipient-2', subject: 'Listado de recibos', trackingToken: null })])).toMatchObject({ status: 'needs_review', recipientId: null })
  })

  it('does not match dry-run or another provider', () => {
    const match = matchReplyToDispatch(reply(), [candidate({ provider: 'dry-run' })])
    expect(match.status).toBe('unmatched')
  })

  it('creates and extracts visible tracking tokens', () => {
    const token = createTrackingToken()
    expect(token).toMatch(/^NIA-[A-F0-9]{12}$/)
    expect(extractTrackingToken(subjectWithTrackingToken('Asunto', token))).toBe(token)
  })

  it('normalizes reply prefixes and produces bounded previews', () => {
    expect(normalizeReplySubject('RE: Fwd: Listado [NIA-ABCDEF123456]')).toBe('listado')
    expect(replyTextPreview('a'.repeat(300))).toHaveLength(240)
  })

  it('ignores automatic mailbox messages', () => {
    expect(isAutomaticMessage(reply({ senderEmail: 'mailer-daemon@example.com' }))).toBe(true)
    expect(isAutomaticMessage(reply({ autoSubmitted: 'auto-replied' }))).toBe(true)
    expect(isAutomaticMessage(reply())).toBe(false)
  })

  it('requires an exact configured scheduler secret', () => {
    expect(isReplySyncAuthorized('cron-secret', 'cron-secret')).toBe(true)
    expect(isReplySyncAuthorized('cron-secret', 'wrong')).toBe(false)
    expect(isReplySyncAuthorized('', '')).toBe(false)
  })
})
