import { z } from 'zod'
import { rutChilenoOpcional as rut } from '@/lib/validations/rut'
import { competencias, detallesDeDiligencia, tiposDeDiligencia } from './diligencias'
import { cortesDeApelaciones, tribunalesDeCorte } from './tribunales'

export const maxPersonas = 100
export const maxDirecciones = 10

const texto = (max: number) => z.string().trim().max(max)
const opcion = (valores: readonly string[], mensaje: string) => z.string().refine(valor => valores.includes(valor), mensaje)

export const causaSchema = z.object({
  competencia: opcion(competencias, 'Selecciona la competencia.'),
  corte: opcion(cortesDeApelaciones, 'Selecciona la Corte de Apelaciones.'),
  tribunal: texto(160).min(1, 'Selecciona el tribunal.'),
  rol: texto(80).min(1, 'Ingresa el ROL o RIT.'),
  cantidad: z.number().int('Ingresa un número entero de personas.').min(1, 'Ingresa al menos una persona.')
    .max(maxPersonas, `Puedes agregar hasta ${maxPersonas} personas en un encargo.`),
  tipo: opcion(tiposDeDiligencia, 'Selecciona qué necesitas.'),
  detalle: opcion(detallesDeDiligencia, 'Selecciona un detalle de diligencia de la lista.'),
  notas: texto(4000),
}).strict().refine(causa => tribunalesDeCorte(causa.corte).includes(causa.tribunal), {
  path: ['tribunal'], message: 'Elige un tribunal de la Corte de Apelaciones seleccionada.',
})

const direccion = z.object({ calle: texto(200), unidad: texto(100), comuna: texto(100) }).strict()
const persona = z.object({ nombre: texto(200), rut, direcciones: z.array(direccion).max(maxDirecciones) }).strict()

const plazos = z.object({
  limite: z.union([z.literal(''), z.iso.date()]),
  audiencia: z.union([z.literal(''), z.iso.date()]),
  hora: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
}).strict().refine(value => !value.hora || Boolean(value.audiencia), {
  path: ['audiencia'], message: 'Agrega la fecha de la audiencia si indicas una hora.',
})

export const boletaSchema = z.object({
  nombre: texto(200),
  rut,
  correo: z.union([z.literal(''), texto(254).pipe(z.email('Ingresa un correo válido.'))]),
  aNombreDe: texto(200),
  retencion: z.enum(['', 'receptor', 'abogado']),
}).strict()

export const boletaCompletaSchema = boletaSchema.superRefine((value, context) => {
  const requeridos = [
    ['nombre', 'Ingresa el nombre de la boleta.'], ['rut', 'Ingresa el RUT de la boleta.'],
    ['correo', 'Ingresa el correo de la boleta.'], ['retencion', 'Selecciona quién retiene el impuesto.'],
  ] as const
  for (const [field, message] of requeridos) {
    if (!value[field]) context.addIssue({ code: 'custom', path: [field], message })
  }
})

export const datosEncargoSchema = z.object({
  causa: causaSchema,
  receptorIds: z.array(texto(100).min(1)),
  personas: z.array(persona).max(maxPersonas),
  plazos,
  boleta: boletaSchema,
}).strict().refine(value => value.personas.length <= value.causa.cantidad, {
  path: ['personas'], message: 'Revisa el número de personas a notificar.',
})

export const guardarEncargoSchema = z.object({
  id: z.uuid(),
  accion: z.enum(['guardar', 'enviar']),
  datos: datosEncargoSchema,
}).strict().superRefine((value, context) => {
  if (value.accion !== 'enviar') return
  if (!value.datos.receptorIds.length) {
    context.addIssue({ code: 'custom', path: ['datos', 'receptorIds'], message: 'Selecciona al menos un receptor.' })
  }
  const boleta = boletaCompletaSchema.safeParse(value.datos.boleta)
  if (!boleta.success) {
    for (const issue of boleta.error.issues) {
      context.addIssue({ code: 'custom', path: ['datos', 'boleta', ...issue.path], message: issue.message })
    }
  }
})

export type DatosEncargo = z.infer<typeof datosEncargoSchema>
export type GuardarEncargo = z.infer<typeof guardarEncargoSchema>
export type ReceptorDisponible = { id: string; nombre: string }
