/**
 * Utilidades para manejo de Cuantía en formato CLP (pesos chilenos)
 * 
 * Funciones para limpiar, formatear y parsear valores de cuantía
 * considerando el formato chileno con separador de miles (puntos)
 */

/**
 * Limpia y parsea un input de cuantía desde un string
 * Elimina puntos (separadores de miles) y espacios, luego parsea a número entero
 * 
 * @param input - String con el valor ingresado por el usuario (ej: "4.000.000" o "4000000")
 * @returns Número entero parseado, o null si el input está vacío o es inválido
 * 
 * @example
 * cleanCuantiaInput("4.000.000") // 4000000
 * cleanCuantiaInput("4000000") // 4000000
 * cleanCuantiaInput("") // null
 * cleanCuantiaInput("abc") // null
 */
export function cleanCuantiaInput(input: string): number | null {
  if (!input || typeof input !== 'string') {
    return null
  }

  // Eliminar espacios y puntos (separadores de miles en formato chileno)
  const cleaned = input.trim().replace(/\./g, '').replace(/\s/g, '')

  // Si está vacío después de limpiar, retornar null
  if (cleaned === '') {
    return null
  }

  // Parsear a número entero
  const parsed = parseInt(cleaned, 10)

  // Verificar que el parseo fue exitoso
  if (isNaN(parsed)) {
    return null
  }

  // Retornar como entero (sin decimales para CLP)
  return Math.floor(parsed)
}

/**
 * Formatea un valor numérico de cuantía en formato CLP con separador de miles
 * Usa Intl.NumberFormat con locale 'es-CL' para formato chileno
 * NO incluye el símbolo "$" para uso en PDFs donde el formato puede variar
 * 
 * @param value - Número a formatear, o null/undefined
 * @returns String formateado con puntos como separadores de miles, o string vacío si value es null/undefined
 * 
 * @example
 * formatCuantiaCLP(4000000) // "4.000.000"
 * formatCuantiaCLP(1234567) // "1.234.567"
 * formatCuantiaCLP(null) // ""
 */
export function formatCuantiaCLP(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }

  // Usar Intl.NumberFormat con locale chileno
  // minimumFractionDigits: 0 para no mostrar decimales
  // useGrouping: true para usar separador de miles (puntos en CL)
  const formatter = new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  })

  return formatter.format(Math.floor(value))
}

/**
 * Parsea un valor de cuantía para almacenamiento en la base de datos
 * Maneja strings (limpia y parsea), numbers (convierte a entero), y null/undefined
 * Siempre retorna un número (0 como default) para mantener compatibilidad con el schema Float
 * 
 * @param value - String con puntos, número, o null/undefined
 * @returns Número entero listo para almacenar en Prisma (Float field)
 * 
 * @example
 * parseCuantiaForStorage("4.000.000") // 4000000
 * parseCuantiaForStorage(4000000.5) // 4000000
 * parseCuantiaForStorage(null) // 0
 * parseCuantiaForStorage(undefined) // 0
 */
export function parseCuantiaForStorage(
  value: string | number | null | undefined
): number {
  // Si es null o undefined, retornar 0 (compatibilidad con schema actual)
  if (value === null || value === undefined) {
    return 0
  }

  // Si es string, limpiar y parsear
  if (typeof value === 'string') {
    const cleaned = cleanCuantiaInput(value)
    // Si no se pudo parsear, retornar 0
    return cleaned !== null ? cleaned : 0
  }

  // Si es number, convertir a entero (ignorar decimales para CLP)
  if (typeof value === 'number') {
    return Math.floor(value)
  }

  // Fallback: retornar 0
  return 0
}

