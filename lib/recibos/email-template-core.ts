import type { SendPreviewGroup } from '@/lib/recibos/send-core'

export const SMART_RECIBOS_TEMPLATE_KEY = 'SMART_RECIBOS'

export const SMART_RECIBOS_TEMPLATE_VARIABLES = [
  'recipient_name',
  'recipient_type',
  'office_name',
  'fecha',
  'cantidad_recibos',
  'monto_total',
] as const

export type SmartRecibosTemplateVariable = typeof SMART_RECIBOS_TEMPLATE_VARIABLES[number]

export type SmartRecibosTemplate = {
  key: typeof SMART_RECIBOS_TEMPLATE_KEY
  subject: string
  body: string
  source: 'saved' | 'fallback'
  variables: readonly SmartRecibosTemplateVariable[]
  unknownVariables: string[]
}

export const FALLBACK_SMART_RECIBOS_TEMPLATE = {
  key: SMART_RECIBOS_TEMPLATE_KEY,
  subject: 'Listado de recibos - {recipient_name} - {fecha}',
  body: [
    'Estimado/a {recipient_name},',
    '',
    'Adjuntamos el listado de {cantidad_recibos} recibos correspondiente a las diligencias seleccionadas.',
    '',
    'Monto total: {monto_total}',
    'Oficina: {office_name}',
    '',
    'Saludos cordiales.',
  ].join('\n'),
} as const

export function extractTemplateVariables(...templates: string[]) {
  const found = new Set<string>()
  const regex = /\{([a-zA-Z0-9_]+)\}/g
  for (const template of templates) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(template)) !== null) found.add(match[1])
  }
  return Array.from(found)
}

export function unknownTemplateVariables(...templates: string[]) {
  const allowed = new Set<string>(SMART_RECIBOS_TEMPLATE_VARIABLES)
  return extractTemplateVariables(...templates).filter(variable => !allowed.has(variable))
}

export function formatTemplateDate(date = new Date()) {
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(date)
    .replace(/\//g, '-')
}

export function formatTemplateCurrency(value: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value)
}

function replaceVariables(template: string, variables: Record<SmartRecibosTemplateVariable, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, variable: string) => {
    return Object.prototype.hasOwnProperty.call(variables, variable)
      ? variables[variable as SmartRecibosTemplateVariable]
      : match
  })
}

export function templateVariablesForGroup(params: {
  group: Pick<SendPreviewGroup, 'recipientName' | 'recipientType' | 'reciboCount' | 'totalAmount'>
  officeName: string
  now?: Date
}): Record<SmartRecibosTemplateVariable, string> {
  return {
    recipient_name: params.group.recipientName,
    recipient_type: params.group.recipientType,
    office_name: params.officeName,
    fecha: formatTemplateDate(params.now),
    cantidad_recibos: String(params.group.reciboCount),
    monto_total: formatTemplateCurrency(params.group.totalAmount),
  }
}

export function renderSmartRecibosTemplate(params: {
  subject: string
  body: string
  group: Pick<SendPreviewGroup, 'recipientName' | 'recipientType' | 'reciboCount' | 'totalAmount'>
  officeName: string
  now?: Date
}) {
  const variables = templateVariablesForGroup(params)
  return {
    subject: replaceVariables(params.subject, variables),
    body: replaceVariables(params.body, variables),
    unknownVariables: unknownTemplateVariables(params.subject, params.body),
  }
}

export function buildTemplatePayload(params: {
  subject: string
  body: string
  source: 'saved' | 'fallback'
}): SmartRecibosTemplate {
  return {
    key: SMART_RECIBOS_TEMPLATE_KEY,
    subject: params.subject,
    body: params.body,
    source: params.source,
    variables: SMART_RECIBOS_TEMPLATE_VARIABLES,
    unknownVariables: unknownTemplateVariables(params.subject, params.body),
  }
}
