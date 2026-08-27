import { z } from 'zod'

import { parseChileReportDate } from './chileTime'

const DateFilterSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa formato YYYY-MM-DD').superRefine((value, context) => {
  try {
    parseChileReportDate(value)
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'La fecha ingresada no es valida.' })
  }
})

const CommonFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  reportId: z.string().min(1).max(120).optional(),
  reportType: z.enum(['all', 'daily', 'monthly', 'custom']).default('all'),
  dateFrom: DateFilterSchema.optional(),
  dateTo: DateFilterSchema.optional(),
}

function validateDateRange(value: { dateFrom?: string; dateTo?: string }, context: z.RefinementCtx) {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dateTo'],
      message: 'La fecha final debe ser igual o posterior a la fecha inicial.',
    })
  }
}

export const ReportHistoryQuerySchema = z.object({
  ...CommonFields,
  status: z.enum(['all', 'ready', 'expired']).default('all'),
  deliveryStatus: z.enum(['all', 'not_sent', 'pending', 'sent', 'partial', 'failed']).default('all'),
}).strict().superRefine(validateDateRange)

export const ReportVersionHistoryQuerySchema = z.object({
  ...CommonFields,
  status: z.enum(['all', 'UPLOADING', 'READY', 'FAILED', 'CORRUPT', 'DELETE_PENDING', 'DELETE_FAILED', 'DELETED']).default('all'),
  scope: z.enum(['all', 'current', 'historical']).default('all'),
}).strict().superRefine(validateDateRange)

export const ReportDeliveryHistoryQuerySchema = z.object({
  ...CommonFields,
  status: z.enum(['all', 'PENDING', 'SENDING', 'SENT', 'PARTIAL', 'FAILED', 'NO_RECIPIENTS', 'CANCELLED']).default('all'),
  mode: z.enum(['all', 'MANUAL', 'SCHEDULED']).default('all'),
  target: z.enum(['all', 'ALL_AUTHORIZED', 'FAILED_ONLY']).default('all'),
}).strict().superRefine(validateDateRange)

export type ReportHistoryQuery = z.infer<typeof ReportHistoryQuerySchema>
export type ReportVersionHistoryQuery = z.infer<typeof ReportVersionHistoryQuerySchema>
export type ReportDeliveryHistoryQuery = z.infer<typeof ReportDeliveryHistoryQuerySchema>

export function paginationResult(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 }
}

export function paginationSkip(page: number, limit: number) {
  return (page - 1) * limit
}
