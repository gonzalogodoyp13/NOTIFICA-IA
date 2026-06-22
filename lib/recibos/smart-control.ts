import 'server-only'

import { prisma } from '@/lib/prisma'
import { DUPLICATE_WINDOW_DAYS, overlappingReciboIds } from '@/lib/recibos/smart-control-core'
import type { SendPreviewGroup } from '@/lib/recibos/send-core'

export async function duplicateIntelligenceForGroup(officeId: number, group: Pick<SendPreviewGroup, 'groupKey' | 'reciboIds'>) {
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 86_400_000)
  const previous = await prisma.recibosDispatchRecipient.findMany({
    where: { groupKey: group.groupKey, status: 'sent', batch: { officeId, dispatchKind: { not: 'test' } } },
    orderBy: { sentAt: 'desc' },
    select: { id: true, sentAt: true, items: { select: { reciboId: true } } },
  })
  const overlaps = previous.filter(item => item.sentAt && item.sentAt >= cutoff).map(item => ({
    id: item.id,
    ids: overlappingReciboIds(group.reciboIds, item.items.map(row => row.reciboId)),
  })).filter(item => item.ids.length)
  const overlappingIds = Array.from(new Set(overlaps.flatMap(item => item.ids)))
  const latest = previous[0] ?? null
  return {
    requiresConfirmation: overlappingIds.length > 0,
    lastSentAt: latest?.sentAt?.toISOString() ?? null,
    previousDispatchId: latest?.id ?? null,
    overlappingReciboIds: overlappingIds,
    overlappingCount: overlappingIds.length,
    warning: overlappingIds.length ? `${overlappingIds.length} recibo(s) ya fueron enviados a este destinatario durante los ultimos ${DUPLICATE_WINDOW_DAYS} dias.` : null,
    overlappingDispatchIds: overlaps.map(item => item.id),
  }
}

export async function enrichSendPreview(officeId: number, groups: SendPreviewGroup[]) {
  const enrichedGroups = await Promise.all(groups.map(async group => ({ ...group, intelligence: await duplicateIntelligenceForGroup(officeId, group) })))
  const suggestions = new Map<string, { recipientType: string; recipientId: number; name: string; problem: string; affectedReciboCount: number; editUrl: string }>()
  for (const group of groups) for (const recipient of group.recipients) {
    if (recipient.validEmail) continue
    const key = `${recipient.recipientType}:${recipient.recipientId}`
    const current = suggestions.get(key)
    suggestions.set(key, {
      recipientType: recipient.recipientType, recipientId: recipient.recipientId, name: recipient.name,
      problem: recipient.email?.trim() ? 'Email invalido' : 'Email faltante',
      affectedReciboCount: (current?.affectedReciboCount ?? 0) + group.reciboCount,
      editUrl: `/ajustes/${recipient.recipientType === 'abogado' ? 'abogados' : 'procuradores'}?editar=${recipient.recipientId}`,
    })
  }
  return { groups: enrichedGroups, cleanupSuggestions: Array.from(suggestions.values()).sort((a, b) => b.affectedReciboCount - a.affectedReciboCount || a.name.localeCompare(b.name, 'es')) }
}
