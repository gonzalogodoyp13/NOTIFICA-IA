import 'server-only'

import { ImapFlow } from 'imapflow'

import { prisma } from '@/lib/prisma'
import { graphAccessToken } from '@/lib/recibos/mailer'
import { sanitizeDispatchError } from '@/lib/recibos/dispatch-history-core'
import { healthState } from '@/lib/recibos/smart-control-core'

type ProviderName = 'microsoft_graph' | 'gmail_smtp'

function configurations() {
  const graphMailbox = process.env.MS_GRAPH_SENDER_EMAIL?.trim() || process.env.MAIL_FROM_EMAIL?.trim() || ''
  const gmailMailbox = process.env.GMAIL_IMAP_USER?.trim() || process.env.GMAIL_SMTP_USER?.trim() || ''
  return [
    { provider: 'microsoft_graph' as const, mailboxAddress: graphMailbox, enabled: process.env.MS_GRAPH_REPLY_ENABLED?.trim() === 'true' || process.env.MAIL_PROVIDER === 'microsoft_graph', configured: !!(graphMailbox && process.env.MS_GRAPH_TENANT_ID && process.env.MS_GRAPH_CLIENT_ID && process.env.MS_GRAPH_CLIENT_SECRET) },
    { provider: 'gmail_smtp' as const, mailboxAddress: gmailMailbox, enabled: process.env.GMAIL_REPLY_ENABLED?.trim() === 'true' || process.env.MAIL_PROVIDER === 'gmail_smtp', configured: !!(gmailMailbox && (process.env.GMAIL_IMAP_APP_PASSWORD || process.env.GMAIL_SMTP_APP_PASSWORD)) },
  ]
}

async function probe(provider: ProviderName, mailbox: string) {
  if (provider === 'microsoft_graph') {
    const token = await graphAccessToken()
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}?$select=id,mail`, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error('Microsoft Graph no pudo acceder al buzon compartido.')
    return
  }
  const client = new ImapFlow({ host: process.env.GMAIL_IMAP_HOST?.trim() || 'imap.gmail.com', port: Number(process.env.GMAIL_IMAP_PORT || 993), secure: process.env.GMAIL_IMAP_SECURE?.trim() !== 'false', auth: { user: mailbox, pass: process.env.GMAIL_IMAP_APP_PASSWORD?.trim() || process.env.GMAIL_SMTP_APP_PASSWORD?.trim() || '' }, logger: false })
  await client.connect()
  try { await client.mailboxOpen('INBOX', { readOnly: true }) } finally { await client.logout().catch(() => undefined) }
}

export async function getProviderHealth(officeId: number) {
  const configs = configurations()
  const persisted = await prisma.recibosProviderHealth.findMany({ where: { officeId } })
  const [latestSends, checkpoints] = await Promise.all([
    prisma.recibosDispatchBatch.groupBy({ by: ['provider'], where: { officeId, status: { in: ['sent', 'partial'] }, dispatchKind: { not: 'test' } }, _max: { sentAt: true } }),
    prisma.recibosReplySyncCheckpoint.findMany({ where: { officeId } }),
  ])
  return configs.map(config => {
    const stored = persisted.find(item => item.provider === config.provider && item.mailboxAddress === config.mailboxAddress)
    const latestSend = latestSends.find(item => item.provider === config.provider)?._max.sentAt ?? null
    const checkpoint = checkpoints.find(item => item.provider === config.provider && item.mailboxAddress === config.mailboxAddress)
    return {
      ...config,
      status: healthState({ enabled: config.enabled, configured: config.configured, lastError: stored?.lastError ?? checkpoint?.lastError, lastHealthyAt: stored?.lastHealthyAt }),
      lastCheckedAt: stored?.lastCheckedAt?.toISOString() ?? null,
      lastHealthyAt: stored?.lastHealthyAt?.toISOString() ?? null,
      lastSuccessfulSendAt: (stored?.lastSuccessfulSendAt ?? latestSend)?.toISOString() ?? null,
      lastSuccessfulSyncAt: (stored?.lastSuccessfulSyncAt ?? checkpoint?.lastSuccessfulAt)?.toISOString() ?? null,
      lastError: stored?.lastError ?? checkpoint?.lastError ?? null,
    }
  })
}

export async function checkProviderHealth(officeId: number, requested?: ProviderName) {
  const results = []
  for (const config of configurations().filter(item => !requested || item.provider === requested)) {
    let status = healthState({ enabled: config.enabled, configured: config.configured })
    let lastError: string | null = null
    let healthyAt: Date | null = null
    if (config.enabled && config.configured) {
      try { await probe(config.provider, config.mailboxAddress); status = 'healthy'; healthyAt = new Date() }
      catch (error) { status = 'degraded'; lastError = sanitizeDispatchError(error) }
    }
    const stored = await prisma.recibosProviderHealth.upsert({
      where: { officeId_provider_mailboxAddress: { officeId, provider: config.provider, mailboxAddress: config.mailboxAddress } },
      create: { officeId, provider: config.provider, mailboxAddress: config.mailboxAddress, status, lastCheckedAt: new Date(), lastHealthyAt: healthyAt, lastError },
      update: { status, lastCheckedAt: new Date(), ...(healthyAt ? { lastHealthyAt: healthyAt } : {}), lastError },
    })
    results.push({ provider: stored.provider, mailboxAddress: stored.mailboxAddress, status: stored.status, lastCheckedAt: stored.lastCheckedAt?.toISOString() ?? null, lastError: stored.lastError })
  }
  return results
}

export async function recordProviderSuccess(params: { officeId: number; provider: string; mailboxAddress: string; kind: 'send' | 'sync' }) {
  if (params.provider === 'dry-run' || !params.mailboxAddress) return
  const now = new Date()
  await prisma.recibosProviderHealth.upsert({
    where: { officeId_provider_mailboxAddress: { officeId: params.officeId, provider: params.provider, mailboxAddress: params.mailboxAddress } },
    create: { officeId: params.officeId, provider: params.provider, mailboxAddress: params.mailboxAddress, status: 'healthy', lastHealthyAt: now, ...(params.kind === 'send' ? { lastSuccessfulSendAt: now } : { lastSuccessfulSyncAt: now }) },
    update: { status: 'healthy', lastHealthyAt: now, lastError: null, ...(params.kind === 'send' ? { lastSuccessfulSendAt: now } : { lastSuccessfulSyncAt: now }) },
  })
}
