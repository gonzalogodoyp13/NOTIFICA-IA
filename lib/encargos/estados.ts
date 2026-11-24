import type { Prisma, RespuestaEncargo } from '@prisma/client'

export const filtrosEstado = [
  { value: 'todas', label: 'Todas' },
  { value: 'esperando-respuesta', label: 'Esperando respuesta' },
  { value: 'por-pagar', label: 'Por pagar' },
  { value: 'en-curso', label: 'En curso' },
  { value: 'finalizadas', label: 'Finalizadas' },
  { value: 'no-aceptadas', label: 'No aceptadas' },
] as const

export type FiltroEstado = typeof filtrosEstado[number]['value']
export type EstadoCausa = Exclude<FiltroEstado, 'todas'> | 'borrador'

const aceptado = { respuesta: 'ACEPTADA' } as const
const conPago = { ...aceptado, pagos: { some: {} } } as const
const enviado = { enviadoAt: { not: null } } as const

export const condicionesEstado: Record<FiltroEstado, Prisma.AbogadoEncargoWhereInput> = {
  todas: {},
  'esperando-respuesta': { ...enviado, receptores: { none: aceptado }, OR: [
    { receptores: { none: {} } }, { receptores: { some: { respuesta: 'PENDIENTE' } } },
  ] },
  'por-pagar': { ...enviado, receptores: { some: aceptado, none: conPago } },
  'en-curso': { ...enviado, finalizadoAt: null, receptores: { some: conPago } },
  finalizadas: { ...enviado, finalizadoAt: { not: null }, receptores: { some: conPago } },
  'no-aceptadas': { ...enviado, receptores: { some: {}, every: { respuesta: 'RECHAZADA' } } },
}

export function estadoDeCausa(causa: {
  enviadoAt: Date | null
  finalizadoAt: Date | null
  receptores: { respuesta: RespuestaEncargo; _count: { pagos: number } }[]
}): EstadoCausa {
  if (!causa.enviadoAt) return 'borrador'
  const aceptados = causa.receptores.filter(receptor => receptor.respuesta === 'ACEPTADA')
  if (aceptados.some(receptor => receptor._count.pagos > 0)) return causa.finalizadoAt ? 'finalizadas' : 'en-curso'
  if (aceptados.length) return 'por-pagar'
  if (causa.receptores.length && causa.receptores.every(receptor => receptor.respuesta === 'RECHAZADA')) return 'no-aceptadas'
  return 'esperando-respuesta'
}
