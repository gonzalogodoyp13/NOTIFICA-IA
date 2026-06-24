import { Prisma } from '@prisma/client'

export const ACTIVITY_RESULTS = ['success', 'failure', 'denied'] as const
export type ActivityResult = (typeof ACTIVITY_RESULTS)[number]

export const ACTIVITY_MODULES = [
  'auth',
  'search',
  'roles',
  'diligencias',
  'notificaciones',
  'documents',
  'recibos',
  'emails',
  'payments',
  'settings',
  'security',
  'audit',
] as const
export type ActivityModule = (typeof ACTIVITY_MODULES)[number]

export type ActivityMetadata = Record<string, unknown>

export type ActivityEventInput = {
  userId: string
  officeId: number
  eventType: string
  module: ActivityModule
  result?: ActivityResult
  recordType?: string | null
  recordId?: string | number | null
  rolId?: string | null
  rol?: string | null
  shortName?: string | null
  description?: string | null
  metadata?: ActivityMetadata | null
  occurredAt?: Date
}

export const FIELD_LABELS: Record<string, string> = {
  rol: 'ROL',
  caratula: 'Caratula',
  estado: 'Estado',
  fecha: 'Fecha',
  fechaEjecucion: 'Fecha de ejecucion',
  fechaPago: 'Fecha de pago',
  numeroBoleta: 'Numero de boleta',
  numeroRecibo: 'Numero de recibo',
  monto: 'Monto',
  medio: 'Medio de pago',
  ref: 'Referencia',
  nombre: 'Nombre',
  email: 'Correo electronico',
  telefono: 'Telefono',
  direccion: 'Direccion',
  comuna: 'Comuna',
  bancoId: 'Banco',
  abogadoId: 'Abogado',
  procuradorId: 'Procurador',
  tipoId: 'Tipo de diligencia',
  diligenciaId: 'Diligencia',
  notificacionId: 'Notificacion',
  documentoId: 'Documento',
}

const BLOCKED_KEY_PATTERN =
  /password|pass|token|authorization|cookie|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|body|bodyText|textPreview|subject|pdf|base64|document|documentoRaw|rawDocument|texto|textoEditado|contenido|generationVariables|variables|search(Text|Query|Term)?|query|q$/i

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const RUT_PATTERN = /\b\d{7,9}-[0-9Kk]\b/g
const PHONE_PATTERN = /\b\d{9,11}\b/g
const MAX_STRING_LENGTH = 240
const MAX_ARRAY_LENGTH = 100

export function maskEmail(value: string) {
  const [local, domain] = value.split('@')
  if (!local || !domain) return '[correo oculto]'
  const visible = local.slice(0, 2)
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`
}

function sanitizeString(value: string) {
  const masked = value
    .replace(EMAIL_PATTERN, match => maskEmail(match))
    .replace(RUT_PATTERN, '[RUT oculto]')
    .replace(PHONE_PATTERN, '[Telefono oculto]')
  return masked.length > MAX_STRING_LENGTH ? `${masked.slice(0, MAX_STRING_LENGTH)}...` : masked
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  )
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (seen.has(value)) return '[Circular]'

  seen.add(value)

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map(item => sanitizeValue(item, seen))
  }

  if (!isPlainObject(value)) return sanitizeString(String(value))

  const entries = Object.entries(value)
    .filter(([key]) => !BLOCKED_KEY_PATTERN.test(key))
    .map(([key, entryValue]) => [key, sanitizeValue(entryValue, seen)])

  return Object.fromEntries(entries)
}

export function sanitizeActivityMetadata(metadata: ActivityMetadata | null | undefined) {
  if (!metadata) return null
  return sanitizeValue(metadata, new WeakSet<object>()) as Prisma.InputJsonValue
}

export function editedFieldsMetadata(fields: string[]) {
  const unique = Array.from(new Set(fields.filter(Boolean))).sort()
  return {
    editedFields: unique.map(field => ({
      field,
      label: FIELD_LABELS[field] ?? field,
    })),
  }
}

export function deletionSnapshot(params: {
  recordType: string
  recordId: string | number
  rol?: string | null
  shortName?: string | null
  userId: string
  timestamp?: Date
}) {
  return {
    deletedRecord: {
      recordType: params.recordType,
      recordId: String(params.recordId),
      rol: params.rol ?? null,
      shortName: params.shortName ?? null,
      userId: params.userId,
      timestamp: (params.timestamp ?? new Date()).toISOString(),
    },
  }
}

export function defaultActivityDescription(input: Pick<ActivityEventInput, 'eventType' | 'result' | 'shortName' | 'rol'>) {
  const result = input.result ?? 'success'
  const target = input.shortName ? `: ${input.shortName}` : input.rol ? ` para el ROL ${input.rol}` : ''
  if (result === 'failure') return `Operacion fallida (${input.eventType})${target}.`
  if (result === 'denied') return `Acceso denegado (${input.eventType})${target}.`

  switch (input.eventType) {
    case 'auth.login':
      return 'Inicio de sesion exitoso.'
    case 'auth.logout':
      return 'Cierre de sesion.'
    case 'search.roles':
      return 'Busqueda de roles realizada.'
    case 'document.view':
      return `Documento visualizado${target}.`
    case 'document.download':
      return `Documento descargado${target}.`
    case 'document.generate':
      return `Documento generado${target}.`
    case 'receipt.export':
      return 'Exportacion de recibos generada.'
    case 'receipt.send':
      return 'Envio de recibos registrado.'
    case 'receipt.test_send':
      return 'Envio de prueba de recibos registrado.'
    case 'receipt.resend':
      return 'Reenvio de recibos registrado.'
    case 'receipt.payment':
      return 'Pago de recibos registrado.'
    case 'receipt.boleta':
      return 'Boleta asociada a recibos.'
    case 'receipt.undo':
      return 'Operacion de recibos deshecha.'
    case 'receipt.reply_classify':
      return 'Respuesta de recibos clasificada.'
    case 'receipt.resolution':
      return 'Resolucion de envio de recibos actualizada.'
    case 'receipt.health_check':
      return 'Revision de proveedor de correo realizada.'
    case 'audit.export':
      return 'Exportacion de auditoria generada.'
    default:
      return `Actividad registrada (${input.eventType})${target}.`
  }
}
