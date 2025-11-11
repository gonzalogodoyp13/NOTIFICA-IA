import { z } from 'zod'

const isoDate = z
  .string()
  .min(1, 'La fecha es requerida')
  .refine(value => !Number.isNaN(Date.parse(value)), {
    message: 'Fecha inválida',
  })

const isoDateNotFuture = isoDate.refine(value => {
  const parsed = new Date(value)
  const now = new Date()
  return parsed <= now
}, 'La fecha no puede estar en el futuro')

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/

export const DiligenciaCreateSchema = z.object({
  tipoId: z.string().min(1, 'tipoId es requerido'),
  fecha: isoDate,
  observaciones: z.string().max(1000, 'Observaciones demasiado extensas').optional(),
  ejecutadoId: z.string().min(1, 'ejecutadoId es requerido').optional(),
  direccionId: z.string().min(1, 'direccionId es requerido').optional(),
  costo: z.number().min(0, 'El costo debe ser mayor o igual a 0').optional(),
  meta: z.record(z.unknown()).optional(),
})

export const DiligenciaUpdateSchema = DiligenciaCreateSchema.partial().extend({
  estado: z.enum(['pendiente', 'completada', 'fallida']).optional(),
})

export const DiligenciaScheduleSchema = z.object({
  fechaEjecucion: isoDateNotFuture,
  horaEjecucion: z
    .string()
    .regex(timeRegex, 'Hora inválida, use el formato HH:mm')
    .optional(),
  ejecutadoId: z.string().min(1, 'ejecutadoId es requerido').optional(),
  direccionId: z.string().min(1, 'direccionId es requerido').optional(),
  observaciones: z.string().max(1000).optional(),
})

export const BoletaGenerateSchema = z.object({
  monto: z.number().min(0, 'El monto debe ser mayor o igual a 0'),
  medio: z.string().min(1, 'El medio de pago es requerido'),
  referencia: z.string().optional(),
  variables: z.record(z.string()).optional(),
})

export const EstampoGenerateSchema = z.object({
  estampoId: z.string().min(1, 'estampoId es requerido'),
  variables: z.record(z.string()).optional(),
})

export const NotaCreateSchema = z.object({
  contenido: z.string().min(3, 'La nota debe tener al menos 3 caracteres'),
})

export const StatusChangeSchema = z.object({
  estado: z.enum(['pendiente', 'en_proceso', 'terminado', 'archivado']),
  motivo: z.string().max(500).optional(),
})

