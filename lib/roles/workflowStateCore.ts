export type DiligenceWorkflowStatus = 'pendiente' | 'completada' | 'fallida'
export type RoleWorkflowStatus = 'pendiente' | 'en_proceso' | 'terminado' | 'archivado'

export function deriveDiligenceWorkflowStatus(params: {
  currentStatus: DiligenceWorkflowStatus
  activeNotificationDocumentTypes: string[][]
}): DiligenceWorkflowStatus {
  if (params.currentStatus === 'fallida') return 'fallida'
  if (params.activeNotificationDocumentTypes.length === 0) return 'pendiente'

  return params.activeNotificationDocumentTypes.every(types => {
    const set = new Set(types)
    return set.has('Recibo') && set.has('Estampo')
  })
    ? 'completada'
    : 'pendiente'
}

export function deriveRoleProgressStatus(
  currentStatus: RoleWorkflowStatus,
  diligenceCount: number
): RoleWorkflowStatus {
  if (currentStatus === 'terminado' || currentStatus === 'archivado') return currentStatus
  return diligenceCount > 0 ? 'en_proceso' : 'pendiente'
}
