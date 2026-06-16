import { z } from 'zod'

const optionalInt = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null(), z.undefined()])
  .transform((value): number | null => value === '' || value === null || value === undefined ? null : Number(value))

const ejecutadoSchema = z.object({
  id: z.string().trim().min(1).nullable().optional(),
  nombre: z.string().trim().min(1, 'El nombre es requerido'),
  rut: z.string().trim().min(1, 'El RUT es requerido'),
  direccion: z.string().trim().nullable().optional(),
  comunaId: optionalInt.optional(),
})

export const DemandaCreateSchema = z.object({
  rol: z.string().trim().min(1).transform(value => value.toUpperCase()),
  tribunalId: z.string().trim().min(1),
  caratula: z.string().trim().min(1),
  cuantia: z.union([z.string(), z.number()]).nullable().optional(),
  abogadoId: z.coerce.number().int().positive(),
  materiaId: optionalInt.optional(),
  procuradorId: optionalInt.optional(),
  ejecutados: z.array(ejecutadoSchema.omit({ id: true })).optional().default([]),
})

export const DemandaUpdateSchema = DemandaCreateSchema.extend({
  abogadoId: optionalInt,
  ejecutados: z.array(ejecutadoSchema).optional(),
})
