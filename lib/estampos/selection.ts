// Helper para parsear y migrar meta.estampoId (legacy) a meta.estampoTipo (nuevo formato)
// Usado por UI y potencialmente APIs para mantener compatibilidad hacia atrás

export type EstampoTipo =
  | {
      kind: 'WIZARD'
      categoria: string
      estampoBaseId?: number
    }
  | {
      kind: 'LEGACY'
      estampoId: string
    }

/**
 * Parsea la estructura de meta para obtener el tipo de estampo seleccionado.
 * Soporta tanto el nuevo formato (meta.estampoTipo) como el legacy (meta.estampoId).
 *
 * @param meta - El objeto meta de la diligencia (puede ser null/undefined)
 * @returns EstampoTipo si existe selección, null si no hay selección
 */
export function parseEstampoTipo(
  meta: Record<string, unknown> | null | undefined
): EstampoTipo | null {
  if (!meta) {
    return null
  }

  // Nuevo formato: meta.estampoTipo existe
  if (meta.estampoTipo) {
    const estampoTipo = meta.estampoTipo as EstampoTipo
    // Validar que tenga kind válido
    if (estampoTipo.kind === 'WIZARD' || estampoTipo.kind === 'LEGACY') {
      return estampoTipo
    }
  }

  // Legacy: meta.estampoId existe
  if (meta.estampoId) {
    return {
      kind: 'LEGACY',
      estampoId: String(meta.estampoId),
    }
  }

  // No hay selección
  return null
}
