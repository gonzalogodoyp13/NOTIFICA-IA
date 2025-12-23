import { prisma } from '@/lib/prisma'
import { formatDateToSpanishWords } from '@/lib/utils/dateFormat'
import { formatCuantiaCLP } from '@/lib/utils/cuantia'
import { replaceVariables } from './text'
import type { VariableDef } from './types'
import type { EstampoBase, EstampoCustom } from '@prisma/client'

// Type for diligencia with all relations used by estampos runtime.
// This is a pragmatic type, not a full Prisma-generated type.
// The API routes guarantee that diligencia is loaded with these relations.
export type DiligenciaWithRelations = {
  id: string
  fecha: Date
  meta: any
  rol: any
}

/**
 * Construye variables iniciales auto-llenadas desde ROL y Diligencia
 * Solo incluye variables con source ROL, DILIGENCIA, o USUARIO (con defaultSource)
 * NO incluye variables DERIVED (se calculan después)
 */
export function buildInitialVariables({
  diligencia,
  rol,
  estampoBase,
  estampoCustom,
  dbUser,
  ejecutadoFromNotificacion,
}: {
  diligencia: DiligenciaWithRelations
  rol: DiligenciaWithRelations['rol']
  estampoBase: EstampoBase
  estampoCustom?: EstampoCustom | null
  dbUser: { officeName: string } | null
  ejecutadoFromNotificacion?: any
}): Record<string, string> {
  const variablesSchema = estampoBase.variablesSchema as unknown as VariableDef[]
  const result: Record<string, string> = {}

  const meta = diligencia.meta as Record<string, unknown> | null
  const ejecutadoId = meta?.ejecutadoId as string | undefined

  // Seleccionar ejecutado
  const ejecutados = rol?.demanda?.ejecutados ?? []
  let ejecutado: any
  
  if (ejecutadoFromNotificacion !== undefined) {
    // ejecutadoFromNotificacion was passed (notificacionId was provided)
    // If it's null, route should have already blocked, but handle gracefully
    ejecutado = ejecutadoFromNotificacion ?? null
  } else {
    // Legacy: notificacionId was NOT provided, use legacy behavior
    if (ejecutadoId) {
      ejecutado = ejecutados.find((e: any) => e.id === ejecutadoId) ?? ejecutados[0]
    } else {
      ejecutado = ejecutados[0]
    }
  }

  // Datos del abogado
  const abogado = rol?.demanda?.abogados
  const banco = abogado?.banco

  // Fecha y hora de ejecución
  const fechaEjecucion = meta?.fechaEjecucion
    ? new Date(meta.fechaEjecucion as string)
    : diligencia.fecha
  const horaEjecucion = (meta?.horaEjecucion as string) ?? ''

  // Cuantía formateada
  const cuantiaRaw = rol?.demanda?.cuantia

  // Iterar sobre variablesSchema y construir solo las auto-llenadas
  for (const variableDef of variablesSchema) {
    // Ignorar variables derivadas (se calculan después)
    if (variableDef.source === 'DERIVED') {
      continue
    }

    let value = ''

    if (variableDef.source === 'ROL') {
      // Mapear variables conocidas desde ROL
      switch (variableDef.name) {
        case 'nombre_ejecutado':
          value = ejecutado?.nombre ?? ''
          break
        case 'rut_ejecutado':
          value = ejecutado?.rut ?? ''
          break
        case 'direccion_ejecutado':
          value = [ejecutado?.direccion, ejecutado?.comunas?.nombre]
            .filter(Boolean)
            .join(', ')
          break
        case 'solo_direccion_ejecutado':
          value = ejecutado?.direccion ?? ''
          break
        case 'solo_comuna_ejecutado':
          value = ejecutado?.comunas?.nombre ?? ''
          break
        case 'monto_ejecutado':
          value = cuantiaRaw ? formatCuantiaCLP(cuantiaRaw) : ''
          break
        default:
          // Si tiene defaultSource, intentar extraer (por ahora dejar vacío)
          value = ''
      }
    } else if (variableDef.source === 'DILIGENCIA') {
      // Mapear variables desde Diligencia
      switch (variableDef.name) {
        case 'fecha_palabras_diligencia':
          value = formatDateToSpanishWords(fechaEjecucion)
          break
        case 'hora_diligencia':
          value = horaEjecucion
          break
        default:
          value = ''
      }
    } else if (variableDef.source === 'USUARIO') {
      // Variables de usuario
      switch (variableDef.name) {
        case 'firma':
          value = '' // Placeholder, se llena después o queda vacío
          break
        default:
          // Si tiene defaultSource, intentar extraer (por ahora dejar vacío)
          value = ''
      }
    }

    result[variableDef.name] = value
  }

  return result
}

/**
 * Calcula variables derivadas a partir de variables existentes
 * Solo procesa variables con type === "DERIVED" en el schema
 */
export function computeDerivedVariables(
  variables: Record<string, string>,
  variablesSchema: VariableDef[]
): Record<string, string> {
  const result: Record<string, string> = {}

  // Filtrar solo variables derivadas
  const derivedVariables = variablesSchema.filter(
    v => v.type === 'DERIVED' && v.derivedFrom && v.derivedFrom.length > 0
  )

  for (const variableDef of derivedVariables) {
    // Verificar que todas las variables en derivedFrom existen
    const allDependenciesExist = variableDef.derivedFrom!.every(
      depName => depName in variables
    )

    if (!allDependenciesExist) {
      // Si faltan dependencias, saltar esta variable derivada
      continue
    }

    let value = ''

    // Lógica de derivación según nombre de variable
    if (variableDef.name === 'tratamiento_corto') {
      const sexo = variables.sexo_demandado || ''
      if (sexo === 'MASCULINO') {
        value = 'don'
      } else if (sexo === 'FEMENINO') {
        value = 'doña'
      } else {
        // Incluye "NO_DEFINIR" y cualquier otro valor
        value = 'don(ña)'
      }
    } else if (variableDef.name === 'tratamiento_largo') {
      const sexo = variables.sexo_demandado || ''
      if (sexo === 'MASCULINO') {
        value = 'el demandado'
      } else if (sexo === 'FEMENINO') {
        value = 'la demandada'
      } else {
        // Incluye "NO_DEFINIR" y cualquier otro valor
        value = 'el(la) demandado(a)'
      }
    } else if (variableDef.name === 'frase_persona_que_informa') {
      const quienInforma = variables.quien_informa || ''
      const numeroVecino = variables.numero_vecino || ''
      
      if (quienInforma === 'VECINA' || quienInforma === 'VECINO') {
        if (numeroVecino.trim() !== '' && numeroVecino.toUpperCase() !== 'NINGUNO') {
          value = `me informó persona adulta vecino/a de la casa signada con el Nº ${numeroVecino}`
        } else {
          value = 'me informó persona adulta vecino/a al domicilio'
        }
      } else if (quienInforma === 'GUARDIA_CONDOMINIO') {
        value = 'me informó el guardia del condominio'
      } else if (quienInforma === 'CONSERJE_EDIFICIO') {
        value = 'me informó el conserje del edificio'
      } else if (quienInforma === 'ADULTO_MISMO_INMUEBLE') {
        value = 'me informó persona adulta del mismo inmueble'
      } else {
        // Fallback seguro si quien_informa no está en valores esperados
        value = ''
      }
    } else if (variableDef.name === 'frase_identificacion') {
      const seIdentifico = variables.se_identifico || ''
      const nombreIdentificacion = variables.nombre_identificacion || ''
      
      if (seIdentifico === 'SI' && nombreIdentificacion.trim() !== '') {
        value = `, que se identificó con el nombre ${nombreIdentificacion}`
      } else {
        value = ', que no se identificó'
      }
    } else {
      // Para otras variables derivadas futuras, dejar vacío por ahora
      value = ''
    }

    result[variableDef.name] = value
  }

  return result
}

/**
 * Renderiza un template de estampo reemplazando todas las variables
 * Reutiliza la función replaceVariables del helper compartido
 */
export function renderEstampoTemplate(
  textoTemplate: string,
  variables: Record<string, string>
): string {
  return replaceVariables(textoTemplate, variables)
}

