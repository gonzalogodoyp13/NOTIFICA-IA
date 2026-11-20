import { z } from 'zod'

export const CARTA_FORMATOS = {
  art44: 'Notificación Art. 44 CPC',
  fuerzaPublica: 'Embargo con Fuerza Pública',
  vehiculo: 'Embargo de Vehículo',
  propiedad: 'Embargo de Propiedad',
  cumplimiento: 'Cumplimiento Incidental',
  otro: 'Otro',
} as const

export type CartaFormato = keyof typeof CARTA_FORMATOS

export const CartaCertificadaSchema = z.object({
  ejecutadoId: z.string().min(1, 'Seleccione un demandado.'),
  direccionEjecutadoId: z.string().min(1, 'Seleccione una dirección.'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) >= 1000
  }, 'Seleccione una fecha válida.'),
  formato: z.enum(['art44', 'fuerzaPublica', 'vehiculo', 'propiedad', 'cumplimiento', 'otro']),
  detalle: z.string().trim().max(3000, 'El texto no puede superar los 3000 caracteres.').default(''),
}).superRefine((data, ctx) => {
  if (['vehiculo', 'propiedad', 'otro'].includes(data.formato) && !data.detalle) {
    ctx.addIssue({ code: 'custom', path: ['detalle'], message: 'Complete el dato adicional del formato seleccionado.' })
  }
  if (data.formato === 'vehiculo' && data.detalle.length > 20) {
    ctx.addIssue({ code: 'custom', path: ['detalle'], message: 'La placa patente no puede superar los 20 caracteres.' })
  }
})
