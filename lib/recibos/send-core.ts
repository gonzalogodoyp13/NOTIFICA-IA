import type { ReceiptListRow } from '@/lib/recibos/query'
import type { ReceiptFiltersInput } from '@/lib/validations/recibos'

export type ReceiptRecipientMode = 'procurador' | 'abogado' | 'ambos'
export type ReceiptRecipientType = 'procurador' | 'abogado'

export type SendRecipient = {
  recipientType: ReceiptRecipientType
  recipientId: number
  name: string
  email: string | null
  validEmail: boolean
}

export type SendExcludedRow = {
  reciboId: string
  numeroRecibo: string
  rol: string
  reason: string
}

export type SendPreviewGroup = {
  groupKey: string
  recipientName: string
  recipientType: 'Procurador' | 'Abogado' | 'Ambos'
  recipients: SendRecipient[]
  reciboIds: string[]
  reciboCount: number
  totalAmount: number
  attachmentFilename: string
  subject: string
  body: string
  warnings: string[]
  canSend: boolean
}

export type SendExcludedSummary = {
  reason: string
  count: number
  rows: SendExcludedRow[]
}

export type SendPreview = {
  recipientMode: ReceiptRecipientMode
  groups: SendPreviewGroup[]
  excluded: SendExcludedSummary[]
  totals: {
    selectedRows: number
    sendableGroups: number
    excludedRows: number
  }
}

export const DEFAULT_SEND_BODY = [
  'Estimado/a,',
  '',
  'Adjuntamos el listado de recibos correspondiente a las diligencias seleccionadas.',
  '',
  'Saludos cordiales.',
].join('\n')

const TYPE_LABELS: Record<ReceiptRecipientType, 'Procurador' | 'Abogado'> = {
  procurador: 'Procurador',
  abogado: 'Abogado',
}

export function isValidEmail(value: string | null | undefined) {
  const email = value?.trim()
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function sanitizeFilenamePart(value: string) {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'sin-nombre'
}

export function buildAttachmentFilename(params: {
  recipientType: string
  recipientName: string
  filters: Pick<ReceiptFiltersInput, 'fechaEjecucionDesde' | 'fechaEjecucionHasta'>
}) {
  const from = params.filters.fechaEjecucionDesde || 'inicio'
  const to = params.filters.fechaEjecucionHasta || 'hoy'
  return `Listado-Diligencias-${sanitizeFilenamePart(params.recipientType)}-${sanitizeFilenamePart(params.recipientName)}-${from}-a-${to}.xlsx`
}

function todayLabel() {
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
}

function defaultSubject(recipientName: string) {
  return `Listado de recibos - ${recipientName} - ${todayLabel()}`
}

function recipientFromRow(row: ReceiptListRow, type: ReceiptRecipientType): SendRecipient | null {
  const id = type === 'procurador' ? row.procuradorId : row.abogadoId
  if (!id) return null
  const name = type === 'procurador' ? row.procurador : row.abogado
  const email = (type === 'procurador' ? row.procuradorEmail : row.abogadoEmail) ?? null
  return {
    recipientType: type,
    recipientId: id,
    name,
    email,
    validEmail: isValidEmail(email),
  }
}

function uniqRecipients(recipients: Array<SendRecipient | null>) {
  const map = new Map<string, SendRecipient>()
  for (const recipient of recipients) {
    if (!recipient) continue
    map.set(`${recipient.recipientType}:${recipient.recipientId}`, recipient)
  }
  return Array.from(map.values())
}

function addExcluded(map: Map<string, SendExcludedRow[]>, row: ReceiptListRow, reason: string) {
  map.set(reason, [...(map.get(reason) ?? []), {
    reciboId: row.reciboId,
    numeroRecibo: row.numeroRecibo,
    rol: row.rol,
    reason,
  }])
}

function keyForMode(row: ReceiptListRow, mode: ReceiptRecipientMode) {
  if (mode === 'procurador') return row.procuradorId ? `procurador:${row.procuradorId}` : null
  if (mode === 'abogado') return row.abogadoId ? `abogado:${row.abogadoId}` : null
  if (!row.abogadoId && !row.procuradorId) return null
  return `ambos:abogado:${row.abogadoId ?? 'none'}:procurador:${row.procuradorId ?? 'none'}`
}

function recipientsForMode(row: ReceiptListRow, mode: ReceiptRecipientMode) {
  if (mode === 'procurador') return uniqRecipients([recipientFromRow(row, 'procurador')])
  if (mode === 'abogado') return uniqRecipients([recipientFromRow(row, 'abogado')])
  return uniqRecipients([recipientFromRow(row, 'abogado'), recipientFromRow(row, 'procurador')])
}

function groupLabel(mode: ReceiptRecipientMode, recipients: SendRecipient[]) {
  if (mode === 'procurador') return { recipientName: recipients[0]?.name ?? 'Sin procurador', recipientType: 'Procurador' as const }
  if (mode === 'abogado') return { recipientName: recipients[0]?.name ?? 'Sin abogado', recipientType: 'Abogado' as const }
  return {
    recipientName: recipients.map(recipient => recipient.name).join(' / ') || 'Sin destinatario',
    recipientType: 'Ambos' as const,
  }
}

function warningForRecipient(recipient: SendRecipient) {
  if (!recipient.email?.trim()) return `${TYPE_LABELS[recipient.recipientType]} sin email: ${recipient.name}`
  if (!recipient.validEmail) return `${TYPE_LABELS[recipient.recipientType]} con email invalido: ${recipient.name}`
  return null
}

export function buildSendPreview(params: {
  rows: ReceiptListRow[]
  filters: ReceiptFiltersInput
  recipientMode: ReceiptRecipientMode
}): SendPreview {
  const grouped = new Map<string, { rows: ReceiptListRow[]; recipients: SendRecipient[] }>()
  const excluded = new Map<string, SendExcludedRow[]>()

  for (const row of params.rows) {
    const key = keyForMode(row, params.recipientMode)
    if (!key) {
      addExcluded(excluded, row, params.recipientMode === 'ambos' ? 'Sin abogado ni procurador asociado.' : `Sin ${params.recipientMode} asociado.`)
      continue
    }
    const recipients = recipientsForMode(row, params.recipientMode)
    if (!recipients.length) {
      addExcluded(excluded, row, 'Sin destinatario asociado.')
      continue
    }
    const current = grouped.get(key)
    grouped.set(key, {
      rows: [...(current?.rows ?? []), row],
      recipients: uniqRecipients([...(current?.recipients ?? []), ...recipients]),
    })
  }

  const groups = Array.from(grouped.entries()).map(([groupKey, group]) => {
    const { recipientName, recipientType } = groupLabel(params.recipientMode, group.recipients)
    const warnings = group.recipients.map(warningForRecipient).filter((value): value is string => !!value)
    const validCount = group.recipients.filter(recipient => recipient.validEmail).length
    return {
      groupKey,
      recipientName,
      recipientType,
      recipients: group.recipients,
      reciboIds: group.rows.map(row => row.reciboId),
      reciboCount: group.rows.length,
      totalAmount: group.rows.reduce((sum, row) => sum + row.valor, 0),
      attachmentFilename: buildAttachmentFilename({ recipientType, recipientName, filters: params.filters }),
      subject: defaultSubject(recipientName),
      body: DEFAULT_SEND_BODY,
      warnings,
      canSend: validCount > 0,
    }
  }).sort((a, b) => a.recipientName.localeCompare(b.recipientName, 'es'))

  const excludedRows = Array.from(excluded.values()).reduce((sum, rows) => sum + rows.length, 0)
  return {
    recipientMode: params.recipientMode,
    groups,
    excluded: Array.from(excluded.entries()).map(([reason, rows]) => ({ reason, count: rows.length, rows })),
    totals: {
      selectedRows: params.rows.length,
      sendableGroups: groups.filter(group => group.canSend).length,
      excludedRows,
    },
  }
}
