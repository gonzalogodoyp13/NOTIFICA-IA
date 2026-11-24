import { z } from 'zod'
import { rutChilenoOpcional } from '@/lib/validations/rut'

const texto = (max: number) => z.string().trim().max(max)
const correo = texto(254).refine(value => !value || z.email().safeParse(value).success, 'Ingresa un correo válido.')
const domicilio = { comuna: texto(100), direccion: texto(250) }

export const contactoAbogadoSchema = z.object({
  nombre: texto(200).min(1, 'Ingresa tu nombre completo.'),
  rut: rutChilenoOpcional,
  correo,
  telefono: texto(30).refine(value => {
    if (!value) return true
    return /^\+?[\d\s().-]+$/.test(value) && /^\+?\d{8,15}$/.test(value.replace(/[\s().-]/g, ''))
  }, 'Ingresa un teléfono válido.'),
  ...domicilio,
}).strict()

export const boletaAbogadoSchema = z.object({
  nombre: texto(200).min(1, 'Ingresa el nombre o razón social.'),
  rut: rutChilenoOpcional.refine(Boolean, 'Ingresa el RUT de la boleta.'),
  giro: texto(160),
  correo,
  ...domicilio,
}).strict()

export const ajusteAbogadoSchema = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('contacto'), datos: contactoAbogadoSchema }).strict(),
  z.object({ accion: z.literal('boleta'), datos: boletaAbogadoSchema }).strict(),
  z.object({ accion: z.literal('baja'), confirma: z.literal(true), motivo: texto(1000) }).strict(),
])

export type ContactoAbogado = z.infer<typeof contactoAbogadoSchema>
export type BoletaAbogado = z.infer<typeof boletaAbogadoSchema>

export const boletaVacia: BoletaAbogado = { nombre: '', rut: '', giro: '', correo: '', comuna: '', direccion: '' }

export function boletaParaNuevoEncargo(contacto: ContactoAbogado, boleta: BoletaAbogado, correoAcceso: string) {
  return {
    nombre: contacto.nombre,
    rut: boleta.rut || contacto.rut,
    correo: boleta.correo || contacto.correo || correoAcceso,
    aNombreDe: boleta.nombre === contacto.nombre ? '' : boleta.nombre,
    retencion: '' as const,
  }
}
