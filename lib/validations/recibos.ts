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

export type ReceiptFiltersInput = z.infer<typeof ReceiptFilterSchema>
