import { deriveNotificationCompleteness } from '@/lib/workflow/completeness'
import { deriveNotificationWorkflowState } from '@/lib/workflow/notificationStatus'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function latestEstampoView(documento: any) {
  if (!documento) return null
  if (documento.estampoBase) {
    return {
      documentoId: documento.id,
      slug: documento.estampoBase.slug ?? null,
      nombreVisible: documento.estampoBase.nombreVisible,
    }
  }
  if (documento.estampo) {
    return {
      documentoId: documento.id,
      slug: null,
      nombreVisible: documento.estampo.nombre,
    }
  }
  return null
}

export function serializeNotification(notificacion: any, diligenciaContext?: any) {
  const meta = isPlainObject(notificacion.meta) ? notificacion.meta : {}
  const execution = isPlainObject(meta.ejecucion) ? meta.ejecucion : {}
  const documents = Array.isArray(notificacion.documentos) ? notificacion.documentos : []
  const workflow = deriveNotificationWorkflowState(documents)
  const diligence = diligenciaContext ?? notificacion.diligencia

  return {
    id: notificacion.id,
    diligenciaId: notificacion.diligenciaId,
    meta: notificacion.meta ?? null,
    ejecutadoId: notificacion.ejecutadoId ?? null,
    bancoId: notificacion.bancoId ?? null,
    createdAt: notificacion.createdAt ? new Date(notificacion.createdAt).toISOString() : null,
    updatedAt: notificacion.updatedAt ? new Date(notificacion.updatedAt).toISOString() : null,
    voidedAt: notificacion.voidedAt ? new Date(notificacion.voidedAt).toISOString() : null,
    voidReason: notificacion.voidReason ?? null,
    voidedByUserId: notificacion.voidedByUserId ?? null,
    workflowStatus: workflow.workflowStatus,
    completeness: deriveNotificationCompleteness({ notificacion, diligencia: diligence }),
    step1Done:
      (typeof execution.fecha === 'string' && execution.fecha.trim().length > 0) ||
      (typeof meta.fechaEjecucion === 'string' && meta.fechaEjecucion.trim().length > 0),
    step2Done: workflow.hasReciboPdf,
    step3Done: workflow.hasEstampoPdf,
    latestReciboId: workflow.latestRecibo?.id ?? null,
    latestEstampoId: workflow.latestEstampo?.id ?? null,
    latestEstampo: latestEstampoView(workflow.latestEstampo),
  }
}

