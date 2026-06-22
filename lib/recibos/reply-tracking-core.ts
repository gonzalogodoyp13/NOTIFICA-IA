import { randomBytes, timingSafeEqual } from 'crypto'

export type ReplyAttachmentMetadata = {
  providerAttachmentId?: string | null
  filename: string
  mimeType?: string | null
  byteSize?: number | null
  contentId?: string | null
  isInline?: boolean
}

export type NormalizedReply = {
  provider: 'microsoft_graph' | 'gmail_smtp'
  mailboxAddress: string
  providerMessageId: string
  providerThreadId?: string | null
  internetMessageId?: string | null
  inReplyTo?: string | null
  references: string[]
  senderName?: string | null
  senderEmail: string
  subject: string
  bodyText: string
  receivedAt: Date
  attachments: ReplyAttachmentMetadata[]
  autoSubmitted?: string | null
}

export type DispatchMatchCandidate = {
  id: string
  provider: string
  providerMessageId: string | null
  providerThreadId: string | null
  providerInternetMessageId: string | null
  trackingToken: string | null
  recipientEmails: string[]
  subject: string
  sentAt: Date | null
}

export type ReplyMatch = {
  status: 'matched' | 'needs_review' | 'unmatched'
  recipientId: string | null
  method: 'thread' | 'in_reply_to' | 'tracking_token' | 'sender_subject' | null
  candidateRecipientIds: string[]
  trackingToken: string | null
}

export function createTrackingToken() {
  return `NIA-${randomBytes(6).toString('hex').toUpperCase()}`
}

export function subjectWithTrackingToken(subject: string, token: string) {
  return `${subject.trim()} [${token}]`
}

export function extractTrackingToken(value: string) {
  return value.match(/\[(NIA-[A-Z0-9]{8,24})\]/i)?.[1]?.toUpperCase() ?? null
}

export function normalizeMessageId(value: string | null | undefined) {
  return value?.trim().replace(/^<|>$/g, '').toLowerCase() || null
}

export function normalizeReplySubject(value: string) {
  return value
    .replace(/\[(NIA-[A-Z0-9]{8,24})\]/gi, '')
    .replace(/^\s*((re|rv|fw|fwd)\s*:\s*)+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function replyTextPreview(value: string, limit = 240) {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length <= limit ? compact : `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`
}

export function isAutomaticMessage(message: NormalizedReply) {
  const autoSubmitted = message.autoSubmitted?.trim().toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true
  return /mailer-daemon|postmaster|no-?reply/i.test(message.senderEmail)
}

export function isReplySyncAuthorized(expected: string | null | undefined, supplied: string | null | undefined) {
  if (!expected?.trim() || !supplied?.trim()) return false
  const expectedBytes = Buffer.from(expected.trim())
  const suppliedBytes = Buffer.from(supplied.trim())
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
}

function uniqueMatch(ids: string[], method: ReplyMatch['method'], token: string | null): ReplyMatch | null {
  const unique = Array.from(new Set(ids))
  if (!unique.length) return null
  if (unique.length === 1) return { status: 'matched', recipientId: unique[0], method, candidateRecipientIds: unique, trackingToken: token }
  return { status: 'needs_review', recipientId: null, method, candidateRecipientIds: unique, trackingToken: token }
}

export function matchReplyToDispatch(message: NormalizedReply, candidates: DispatchMatchCandidate[]): ReplyMatch {
  const providerCandidates = candidates.filter(candidate =>
    candidate.provider === message.provider && (!candidate.sentAt || candidate.sentAt.getTime() <= message.receivedAt.getTime() + 60_000)
  )
  const token = extractTrackingToken(`${message.subject}\n${message.bodyText}`)

  if (message.providerThreadId) {
    const match = uniqueMatch(providerCandidates
      .filter(candidate => candidate.providerThreadId && candidate.providerThreadId === message.providerThreadId)
      .map(candidate => candidate.id), 'thread', token)
    if (match) return match
  }

  const replyIds = new Set([message.inReplyTo, ...message.references].map(normalizeMessageId).filter((value): value is string => !!value))
  if (replyIds.size) {
    const match = uniqueMatch(providerCandidates.filter(candidate => {
      const ids = [candidate.providerInternetMessageId, candidate.providerMessageId].map(normalizeMessageId)
      return ids.some(id => !!id && replyIds.has(id))
    }).map(candidate => candidate.id), 'in_reply_to', token)
    if (match) return match
  }

  if (token) {
    const match = uniqueMatch(providerCandidates.filter(candidate => candidate.trackingToken?.toUpperCase() === token).map(candidate => candidate.id), 'tracking_token', token)
    if (match) return match
  }

  const sender = message.senderEmail.trim().toLowerCase()
  const subject = normalizeReplySubject(message.subject)
  const match = uniqueMatch(providerCandidates.filter(candidate =>
    candidate.recipientEmails.some(email => email.trim().toLowerCase() === sender) &&
    normalizeReplySubject(candidate.subject) === subject
  ).map(candidate => candidate.id), 'sender_subject', token)
  return match ?? { status: 'unmatched', recipientId: null, method: null, candidateRecipientIds: [], trackingToken: token }
}
