/**
 * Reemplaza variables en un template de texto
 * Reemplaza todas las ocurrencias de $variableName con el valor correspondiente
 * 
 * @param template - Template con variables en formato $nombreVariable
 * @param variables - Mapa de variables a reemplazar
 * @returns Template con variables reemplazadas
 */
export function replaceVariables(
  template: string,
  variables?: Record<string, string>
): string {
  if (!variables) return template
  let result = template
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replaceAll(`$${key}`, String(value ?? ''))
  })
  return result
}

