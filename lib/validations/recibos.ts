import { z } from 'zod'

const stringArray = z.array(z.string().trim()).optional().default([])

const intArray = stringArray
  .transform(values => values.filter(Boolean).map(value => Number.parseInt(value, 10)))
  .refine(values => values.every(Number.isInteger), { message: 'Valor numerico invalido' })

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform(value => value || undefined)
  .refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), { message: 'Fecha invalida' })

const optionalNumber = z.preprocess(
  value => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.number().min(0).optional()
)

export const ReceiptFilterSchema = z
  .object({
    procuradorIds: intArray,
    bancoIds: intArray,
    abogadoIds: intArray,
    estados: z.array(z.enum(['PAGADO', 'NO_PAGADO'])).optional().default([]),
    estampoTemplates: stringArray,
    rol: z.string().trim().max(100).optional().transform(value => value || undefined),
    fechaEjecucionDesde: optionalDate,
    fechaEjecucionHasta: optionalDate,
    numeroBoleta: z.string().trim().max(100).optional().transform(value => value || undefined),
    boletaMatch: z.enum(['contains', 'exact']).default('contains'),
    montoMin: optionalNumber,
    montoMax: optionalNumber,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .superRefine((value, ctx) => {
    if (value.fechaEjecucionDesde && value.fechaEjecucionHasta && value.fechaEjecucionDesde > value.fechaEjecucionHasta) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La fecha desde no puede ser mayor que la fecha hasta.', path: ['fechaEjecucionDesde'] })
    }
    if (value.montoMin !== undefined && value.montoMax !== undefined && value.montoMin > value.montoMax) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El monto minimo no puede ser mayor que el monto maximo.', path: ['montoMin'] })
    }
  })

export const ReceiptExportSchema = z.object({
  filters: ReceiptFilterSchema,
  selection: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('explicit'), reciboIds: z.array(z.string().min(1)).min(1).max(5000) }),
    z.object({ mode: z.literal('allFiltered'), excludedIds: z.array(z.string().min(1)).max(5000).default([]) }),
  ]),
})

const ReceiptSelectionSchema = ReceiptExportSchema.shape.selection

export const ReceiptSendPreviewSchema = z.object({
  filters: ReceiptFilterSchema,
  selection: ReceiptSelectionSchema,
  recipientMode: z.enum(['procurador', 'abogado', 'ambos']).default('procurador'),
  template: z.object({
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(4000),
  }).optional(),
})

export const ReceiptSendSchema = ReceiptSendPreviewSchema.extend({
  template: z.object({
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(4000),
  }),
  groups: z.array(z.object({
    groupKey: z.string().min(1),
    duplicateConfirmation: z.object({
      confirmed: z.literal(true),
      reason: z.string().trim().min(3).max(500),
    }).optional(),
    recipients: z.array(z.object({
      recipientType: z.enum(['procurador', 'abogado']),
      recipientId: z.number().int().positive(),
      email: z.string().trim().max(320),
      saveToRecord: z.boolean().default(false),
    })).min(1),
  })).min(1),
})

export const ReceiptEmailTemplateSaveSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
})

export const ReceiptTestSendSchema = ReceiptSendPreviewSchema.extend({
  template: z.object({ subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(4000) }),
  groupKey: z.string().min(1),
})

export const ReplyClassificationSchema = z.object({
  classification: z.enum(['recibido', 'observado', 'requiere_correccion', 'pago_informado', 'otro']),
})

export const DispatchResolutionSchema = z.object({
  resolved: z.boolean(),
  note: z.string().trim().max(2000).optional().transform(value => value || undefined),
})

export const DispatchResendSchema = z.object({
  emails: z.array(z.string().trim().email()).min(1).max(5),
  subject: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(4000),
  reason: z.string().trim().min(3).max(500),
  confirmPartial: z.boolean().default(false),
  duplicateConfirmation: z.object({ confirmed: z.literal(true), reason: z.string().trim().min(3).max(500) }).optional(),
})

export type ReceiptFiltersInput = z.infer<typeof ReceiptFilterSchema>
export type ReceiptSendPreviewInput = z.infer<typeof ReceiptSendPreviewSchema>
export type ReceiptSendInput = z.infer<typeof ReceiptSendSchema>
export type ReceiptTestSendInput = z.infer<typeof ReceiptTestSendSchema>
