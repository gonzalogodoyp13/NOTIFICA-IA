import { z } from 'zod'

import {
  CHILE_TIMEZONE,
  chileDateString,
  chileDayBounds,
  chileMonthBounds,
  localChileDateTimeToUtc,
  parseChileReportDate,
  partsInChile,
} from './chileTime'

export const REPORT_JOB_STATUSES = ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const
export const REPORT_JOB_TYPES = ['GENERATE', 'DELIVER'] as const
export const SCHEDULE_HEALTH_STATES = ['DISABLED', 'HEALTHY', 'RUNNING', 'ATTENTION', 'CRITICAL'] as const
export type ScheduleHealth = typeof SCHEDULE_HEALTH_STATES[number]

export const CUSTOM_REPORT_COLUMNS = [
  'timestamp',
  'actor',
  'module',
  'category',
  'eventType',
  'result',
  'recordType',
  'recordId',
  'rol',
  'shortName',
  'description',
  'detail',
] as const

export const CUSTOM_REPORT_COLUMN_LABELS: Record<typeof CUSTOM_REPORT_COLUMNS[number], string> = {
  timestamp: 'Fecha y hora Chile',
  actor: 'Administrador / sistema',
  module: 'Módulo',
  category: 'Categoría',
  eventType: 'Tipo de evento',
  result: 'Resultado',
  recordType: 'Tipo de registro',
  recordId: 'Identificador',
  rol: 'ROL',
  shortName: 'Nombre corto',
  description: 'Descripción',
  detail: 'Detalle seguro',
}

export const CustomDefinitionInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  modules: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  actionCategories: z.array(z.enum(['CREATE', 'UPDATE', 'DELETE', 'READ', 'OTHER'])).min(1),
  results: z.array(z.enum(['success', 'failure', 'denied'])).min(1),
  actorUserIds: z.array(z.string().min(1).max(120)).max(100).default([]),
  includeSystem: z.boolean().default(true),
  selectedColumns: z.array(z.enum(CUSTOM_REPORT_COLUMNS)).min(1).max(CUSTOM_REPORT_COLUMNS.length)
    .refine(values => new Set(values).size === values.length, 'Las columnas no pueden repetirse.'),
  recipientUserIds: z.array(z.string().min(1).max(120)).max(100).default([]),
  schedule: z.object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    weekday: z.number().int().min(1).max(7).nullable().optional(),
    monthDay: z.number().int().min(1).max(28).nullable().optional(),
    latenessThresholdMinutes: z.number().int().min(5).max(1440).default(60),
  }).nullable().optional(),
}).strict()

export const JobListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['all', ...REPORT_JOB_STATUSES]).default('all'),
  type: z.enum(['all', ...REPORT_JOB_TYPES]).default('all'),
  reportKind: z.enum(['all', 'daily', 'monthly', 'custom']).default('all'),
  origin: z.enum(['all', 'MANUAL', 'SCHEDULED', 'CHAINED']).default('all'),
}).strict()

export const ManualCustomRunSchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deliver: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  let from: ReturnType<typeof parseChileReportDate>
  let to: ReturnType<typeof parseChileReportDate>
  try { from = parseChileReportDate(value.dateFrom); to = parseChileReportDate(value.dateTo) } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'El rango de fechas no es válido.' }); return
  }
  const days = Math.floor((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86400000) + 1
  if (days < 1) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dateTo'], message: 'La fecha final debe ser posterior o igual a la inicial.' })
  if (days > 366) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dateTo'], message: 'El rango máximo es de 366 días.' })
})

export function safeReportError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error)
  return value.replace(/(?:postgres(?:ql)?:\/\/|https?:\/\/)[^\s]+/gi, '[servicio]').replace(/\s+/g, ' ').trim().slice(0, 500) || 'Error de procesamiento.'
}

export function isTransientReportError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  const message = safeReportError(error).toLowerCase()
  return /^P(?:100|101|2024|2034)/.test(code)
    || /timeout|temporar|network|fetch failed|connection|rate limit|429|502|503|504|storage|provider/.test(message)
}

export function reportRetryDelayMs(attemptNumber: number) {
  return [60_000, 5 * 60_000, 15 * 60_000][Math.max(0, attemptNumber - 1)] ?? 15 * 60_000
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function nextScheduleRun(input: {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  localTime: string
  weekday?: number | null
  monthDay?: number | null
}, after = new Date()) {
  const [hour, minute] = input.localTime.split(':').map(Number)
  const chile = partsInChile(after)
  for (let offset = 0; offset <= 400; offset += 1) {
    const candidate = new Date(Date.UTC(chile.year, chile.month - 1, chile.day + offset))
    const weekday = candidate.getUTCDay() === 0 ? 7 : candidate.getUTCDay()
    if (input.frequency === 'WEEKLY' && weekday !== (input.weekday ?? 1)) continue
    if (input.frequency === 'MONTHLY' && candidate.getUTCDate() !== (input.monthDay ?? 1)) continue
    const utc = localChileDateTimeToUtc(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, candidate.getUTCDate(), hour, minute)
    if (utc.getTime() > after.getTime()) return utc
  }
  throw new Error('No se pudo resolver la próxima ejecución.')
}

export function schedulePeriod(input: {
  kind: 'DAILY' | 'MONTHLY' | 'CUSTOM'
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
}, runAt = new Date()) {
  const current = parseChileReportDate(chileDateString(runAt))
  if (input.frequency === 'MONTHLY' || input.kind === 'MONTHLY') {
    const previous = new Date(Date.UTC(current.year, current.month - 2, 1))
    const month = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`
    const bounds = chileMonthBounds(month)
    return { start: bounds.start, end: bounds.end, label: month }
  }
  if (input.frequency === 'WEEKLY') {
    const today = new Date(Date.UTC(current.year, current.month - 1, current.day))
    const weekday = today.getUTCDay() === 0 ? 7 : today.getUTCDay()
    const thisMonday = new Date(today.getTime() - (weekday - 1) * 86400000)
    const previousMonday = new Date(thisMonday.getTime() - 7 * 86400000)
    const previousSunday = new Date(previousMonday.getTime() + 6 * 86400000)
    const from = isoDate(previousMonday.getUTCFullYear(), previousMonday.getUTCMonth() + 1, previousMonday.getUTCDate())
    const to = isoDate(previousSunday.getUTCFullYear(), previousSunday.getUTCMonth() + 1, previousSunday.getUTCDate())
    return { start: chileDayBounds(from).start, end: chileDayBounds(to).end, label: `${from}_${to}` }
  }
  const previous = new Date(Date.UTC(current.year, current.month - 1, current.day - 1))
  const date = isoDate(previous.getUTCFullYear(), previous.getUTCMonth() + 1, previous.getUTCDate())
  const bounds = chileDayBounds(date)
  return { start: bounds.start, end: bounds.end, label: date }
}

export function deriveScheduleHealth(input: {
  enabled: boolean
  nextRunAt: Date | null
  lastAttemptAt: Date | null
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  consecutiveFailures: number
  latenessThresholdMinutes: number
  hasRecipients: boolean
  lastJob?: { status: string; leaseExpiresAt: Date | null } | null
}, now = new Date()): { state: ScheduleHealth; reason: string } {
  if (!input.enabled) return { state: 'DISABLED', reason: 'Programación desactivada.' }
  if (!input.hasRecipients) return { state: 'ATTENTION', reason: 'No hay destinatarios habilitados.' }
  if (input.lastJob && ['RUNNING', 'CANCEL_REQUESTED'].includes(input.lastJob.status)) {
    if (input.lastJob.leaseExpiresAt && input.lastJob.leaseExpiresAt < now) return { state: 'CRITICAL', reason: 'El trabajo activo perdió su lease.' }
    return { state: 'RUNNING', reason: 'El trabajo programado está en ejecución.' }
  }
  if (input.consecutiveFailures >= 3) return { state: 'CRITICAL', reason: 'Tres o más ejecuciones consecutivas fallaron.' }
  if (input.nextRunAt && now.getTime() > input.nextRunAt.getTime() + input.latenessThresholdMinutes * 60_000) return { state: 'CRITICAL', reason: 'La ejecución esperada está atrasada.' }
  if (!input.lastAttemptAt) return { state: 'ATTENTION', reason: 'La programación todavía no se ha ejecutado.' }
  if (input.lastFailureAt && (!input.lastSuccessAt || input.lastFailureAt > input.lastSuccessAt)) return { state: 'ATTENTION', reason: 'La última ejecución falló.' }
  return { state: 'HEALTHY', reason: 'Ejecuciones y tiempos dentro de lo esperado.' }
}

export const REPORT_TIMEZONE = CHILE_TIMEZONE
