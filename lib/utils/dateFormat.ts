/**
 * Utilidades para formateo de fechas en espanol.
 */

function numberToSpanishWords(value: number): string {
  const units = [
    'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  ]
  const teens = [
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
    'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve',
  ]
  const tens = [
    '', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta',
    'sesenta', 'setenta', 'ochenta', 'noventa',
  ]
  const hundreds = [
    '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
    'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
  ]

  if (value < 10) {
    return units[value]
  }

  if (value < 20) {
    return teens[value - 10]
  }

  if (value < 30) {
    if (value === 20) {
      return 'veinte'
    }
    return `veinti${units[value - 20]}`
  }

  if (value < 100) {
    const ten = Math.floor(value / 10)
    const unit = value % 10
    return unit === 0 ? tens[ten] : `${tens[ten]} y ${units[unit]}`
  }

  if (value === 100) {
    return 'cien'
  }

  if (value < 1000) {
    const hundred = Math.floor(value / 100)
    const remainder = value % 100
    return remainder === 0
      ? hundreds[hundred]
      : `${hundreds[hundred]} ${numberToSpanishWords(remainder)}`
  }

  if (value < 2000) {
    const remainder = value % 1000
    return remainder === 0 ? 'mil' : `mil ${numberToSpanishWords(remainder)}`
  }

  if (value < 1000000) {
    const thousands = Math.floor(value / 1000)
    const remainder = value % 1000
    const thousandsText = `${numberToSpanishWords(thousands)} mil`
    return remainder === 0
      ? thousandsText
      : `${thousandsText} ${numberToSpanishWords(remainder)}`
  }

  return String(value)
}

/**
 * Convierte una fecha a formato en palabras en espanol.
 * Ejemplo: new Date('2026-04-06') -> "seis de abril de dos mil veintiseis"
 */
export function formatDateToSpanishWords(date: Date): string {
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]

  const day = numberToSpanishWords(date.getDate())
  const month = months[date.getMonth()]
  const year = numberToSpanishWords(date.getFullYear())

  return `${day} de ${month} de ${year}`
}
