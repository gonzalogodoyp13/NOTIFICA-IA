import { z } from 'zod'

const optionalIntFromString = z
  .string()
  .trim()
  .transform(value => (value ? Number.parseInt(value, 10) : undefined))
  .refine(value => value === undefined || Number.isInteger(value), {
    message: 'Valor numérico inválido',
  })
  .optional()

const optionalDateString = z
  .string()
  .trim()
  .refine(value => !value || !Number.isNaN(Date.parse(value)), {
    message: 'Fecha inválida',
  })
  .optional()

export const ReceiptFilterSchema = z
  .object({
    procuradorId: optionalIntFromString,
    bancoId: optionalIntFromString,
    abogadoId: optionalIntFromString,
    rol: z.string().trim().max(100).optional(),
    fechaDesde: optionalDateString,
    fechaHasta: optionalDateString,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .superRefine((value, ctx) => {
    const requiresDateRange =
      typeof value.procuradorId === 'number' ||
      typeof value.bancoId === 'number' ||
      typeof value.abogadoId === 'number'

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
