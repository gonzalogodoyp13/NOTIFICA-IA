export type EstampoTipo =
  | { kind: 'WIZARD'; categoria: string; estampoBaseId?: number }
  | { kind: 'CUSTOM'; estampoId: string }

export function parseEstampoTipo(meta: Record<string, unknown> | null | undefined): EstampoTipo | null {
  if (!meta) return null

  const value = meta.estampoTipo
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>
    if (candidate.kind === 'WIZARD' && typeof candidate.categoria === 'string') {
      return {
        kind: 'WIZARD',
        categoria: candidate.categoria,
        ...(typeof candidate.estampoBaseId === 'number' ? { estampoBaseId: candidate.estampoBaseId } : {}),
      }
    }
    if ((candidate.kind === 'CUSTOM' || candidate.kind === 'LEGACY') && typeof candidate.estampoId === 'string') {
      return { kind: 'CUSTOM', estampoId: candidate.estampoId }
    }
  }

  if (typeof meta.estampoId === 'string' || typeof meta.estampoId === 'number') {
    return { kind: 'CUSTOM', estampoId: String(meta.estampoId) }
  }
  return null
}
