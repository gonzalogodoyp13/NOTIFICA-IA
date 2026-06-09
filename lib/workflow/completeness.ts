import { parseEstampoTipo } from '@/lib/estampos/selection'

export type NotificationCompleteness = {
  isComplete: boolean
  missingFields: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasValue(value: unknown) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined
}

export function deriveNotificationCompleteness(params: {
  notificacion: any
  diligencia: any
}): NotificationCompleteness {
  const { notificacion, diligencia } = params
  const missingFields: string[] = []
  const meta = isPlainObject(notificacion?.meta) ? notificacion.meta : {}
  const ejecutado = notificacion?.ejecutado ?? null
  const demanda = diligencia?.rol?.demanda ?? null
  const abogado = demanda?.abogados ?? null
  const banco = abogado?.bancos?.[0]?.banco ?? null
  const estampoTipo = parseEstampoTipo(meta)

  if (!notificacion?.ejecutadoId || !ejecutado) missingFields.push('ejecutado')
  if (!hasValue(ejecutado?.direccion)) missingFields.push('address')
  if (!hasValue(ejecutado?.comunaId) && !ejecutado?.comunas) missingFields.push('comuna')
  if (!abogado) missingFields.push('abogado')
  if (!banco) missingFields.push('banco')
  if (!hasValue(meta.monto)) missingFields.push('arancel')
  if (!estampoTipo) missingFields.push('estampo_type')

  return {
    isComplete: missingFields.length === 0,
    missingFields,
  }
}
