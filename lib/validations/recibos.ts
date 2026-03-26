import { z } from 'zod'

const optionalIntArrayFromStrings = z
  .array(z.string().trim())
  .optional()
  .default([])
  .transform(values =>
    values
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => Number.parseInt(value, 10))
  )
  .refine(values => values.every(value => Number.isInteger(value)), {
    message: 'Valor numerico invalido',
  })

const optionalDateString = z
  .string()
  .trim()
  .refine(value => !value || !Number.isNaN(Date.parse(value)), {
    message: 'Fecha invalida',
  })
  .optional()

export const ReceiptFilterSchema = z
  .object({
    procuradorIds: optionalIntArrayFromStrings,
    bancoIds: optionalIntArrayFromStrings,
    abogadoIds: optionalIntArrayFromStrings,
    rol: z.string().trim().max(100).optional(),
    fechaDesde: optionalDateString,
    fechaHasta: optionalDateString,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .superRefine((value, ctx) => {
    const requiresDateRange =
      value.procuradorIds.length > 0 ||
      value.bancoIds.length > 0 ||
      value.abogadoIds.length > 0

    if (requiresDateRange && (!value.fechaDesde || !value.fechaHasta)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Debes indicar fecha desde y fecha hasta para filtrar por procurador, banco o abogado.',
        path: ['fechaDesde'],
      })
    }

    if (value.fechaDesde && value.fechaHasta) {
      const desde = new Date(value.fechaDesde)
      const hasta = new Date(value.fechaHasta)

      if (desde > hasta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La fecha desde no puede ser mayor que la fecha hasta.',
          path: ['fechaDesde'],
        })
      }
    }
  })

export type ReceiptFiltersInput = z.infer<typeof ReceiptFilterSchema>
