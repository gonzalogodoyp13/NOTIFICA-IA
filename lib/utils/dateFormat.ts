/**
 * Utilidades para formateo de fechas en español
 */

/**
 * Convierte una fecha a formato en palabras en español
 * Ejemplo: new Date('2025-11-10') → "10 de noviembre de 2025"
 * 
 * @param date - Fecha a formatear
 * @returns String con la fecha en palabras
 */
export function formatDateToSpanishWords(date: Date): string {
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
}

