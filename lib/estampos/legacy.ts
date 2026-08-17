import { Prisma } from '@prisma/client'

import { formatDateToSpanishWords } from '@/lib/utils/dateFormat'
import { formatCuantiaCLP } from '@/lib/utils/cuantia'
import { asJsonObject, getString } from '@/lib/utils/json'
import type { OfficePdfConfig } from '@/lib/pdf/officeConfig'
import type { EstampoEjecutado } from '@/lib/estampos/runtime'

export const customEstampoDiligenciaInclude = {
  rol: { include: {
    tribunal: { select: { id: true, nombre: true } },
    demanda: { include: {
      abogados: { include: { bancos: { include: { banco: true } } } },
      ejecutados: { include: { comunas: true } },
    } },
  } },
} satisfies Prisma.DiligenciaInclude

export type CustomEstampoDiligenciaWithRelations = Prisma.DiligenciaGetPayload<{
  include: typeof customEstampoDiligenciaInclude
}>

export function buildCustomEstampoVariables(
  diligencia: CustomEstampoDiligenciaWithRelations,
  dbUser: { officeName: string } | null,
  officePdfConfig: Pick<OfficePdfConfig, 'receptorNombre'> | null,
  ejecutadoFromNotificacion?: EstampoEjecutado | null,
  chargedAmount?: number | null
): Record<string, string> {
  const meta = asJsonObject(diligencia.meta)
  const ejecutadoId = getString(meta?.ejecutadoId)

  const ejecutados = diligencia.rol.demanda?.ejecutados ?? []
  let ejecutado: EstampoEjecutado | null | undefined

  if (ejecutadoFromNotificacion !== undefined) {
    ejecutado = ejecutadoFromNotificacion ?? null
  } else if (ejecutadoId) {
    ejecutado = ejecutados.find(e => e.id === ejecutadoId) ?? ejecutados[0]
  } else {
    ejecutado = ejecutados[0]
  }

  const abogado = diligencia.rol.demanda?.abogados
  const banco = abogado?.bancos?.[0]?.banco ?? null
  const tribunal = diligencia.rol.tribunal

  const fechaEjecucion = meta?.fechaEjecucion
    ? new Date(meta.fechaEjecucion as string)
    : diligencia.fecha
  const horaEjecucion = (meta?.horaEjecucion as string) ?? ''

  const montoSeleccionadoRaw =
    typeof chargedAmount === 'number'
      ? chargedAmount
      : typeof meta?.monto === 'number'
      ? meta.monto
      : typeof meta?.monto === 'string'
        ? Number(meta.monto.toString().replace(/\./g, '').replace(/\s/g, ''))
        : null
  const montoSeleccionado =
    typeof montoSeleccionadoRaw === 'number' && Number.isFinite(montoSeleccionadoRaw)
      ? montoSeleccionadoRaw
      : null
  const cuantiaRaw = diligencia.rol.demanda?.cuantia
  const cuantiaFormatted = cuantiaRaw ? formatCuantiaCLP(cuantiaRaw) : ''
  const montoEjecutadoFormatted =
    montoSeleccionado !== null
      ? `$${formatCuantiaCLP(montoSeleccionado)}`
      : ''

  return {
    nombre_ejecutado: ejecutado?.nombre ?? '',
    rut_ejecutado: ejecutado?.rut ?? '',
    direccion_ejecutado: [ejecutado?.direccion, ejecutado?.comunas?.nombre]
      .filter(Boolean)
      .join(', '),
    solo_direccion_ejecutado: ejecutado?.direccion ?? '',
    solo_comuna_ejecutado: ejecutado?.comunas?.nombre ?? '',

    abogado_nombre: abogado?.nombre ?? '',
    abogado_direccion: [abogado?.direccion, abogado?.comuna]
      .filter(Boolean)
      .join(', '),

    rol: diligencia.rol.rol,
    tribunal: tribunal?.nombre ?? '',
    caratula: [banco?.nombre, ejecutado?.nombre].filter(Boolean).join(' / '),

    cuantia: cuantiaFormatted,
    monto_ejecutado: montoEjecutadoFormatted,

    fecha_palabras_diligencia: formatDateToSpanishWords(fechaEjecucion),
    hora_diligencia: horaEjecucion,

    receptor_nombre: officePdfConfig?.receptorNombre ?? dbUser?.officeName ?? 'Receptor Judicial',
    n_operacion: getString(meta?.n_operacion) ?? '',
  }
}
