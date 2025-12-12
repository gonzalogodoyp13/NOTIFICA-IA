/**
 * Variable extraction and validation helpers for estampo templates
 */

/**
 * Extracts all variable names from a template string
 * Matches patterns like $variableName using regex
 * 
 * @param template - Template string with $variables
 * @returns Array of unique variable names (without $ prefix)
 */
export function extractVariables(template: string): string[] {
  const regex = /\$(\w+)/g
  const matches: string[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(template)) !== null) {
    const varName = match[1]
    if (!matches.includes(varName)) {
      matches.push(varName)
    }
  }

  return matches
}

/**
 * Validates that all required variables are present in the template
 * 
 * @param template - Template string to validate
 * @param requiredVars - Array of required variable names (without $ prefix)
 * @returns Object with validation result and missing variables
 */
export function validateRequiredVariables(
  template: string,
  requiredVars: string[]
): { valid: boolean; missing: string[] } {
  if (requiredVars.length === 0) {
    return { valid: true, missing: [] }
  }

  const extractedVars = extractVariables(template)
  const missing: string[] = []

  for (const requiredVar of requiredVars) {
    if (!extractedVars.includes(requiredVar)) {
      missing.push(requiredVar)
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  }
}

