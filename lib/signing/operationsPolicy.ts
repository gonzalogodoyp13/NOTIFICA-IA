// Shared server/browser policy. No credentials, raw exception text or local paths.
export const DELIVERY_ATTEMPT_LIMIT = 6
export const DELIVERY_RETRY_CODES = ['NETWORK', 'STORAGE'] as const
export function deliveryCanRetry(code: string | null, attempts: number) {
  return attempts < DELIVERY_ATTEMPT_LIMIT && (code === null || DELIVERY_RETRY_CODES.some(c => c === code))
}
export function deliveryDelayMs(attempt: number) { return Math.min(3_600_000, 30_000 * 2 ** Math.max(0, Math.min(attempt - 1, 10))) }
export const monitoringMessages = {
  REMOTE_SESSION_REQUIRED: 'Habilita una sesión de firma remota en el equipo con el token. Las solicitudes web permanecen en cola.',
  AGENT_UPDATE_REQUIRED: 'Actualiza el agente antes de iniciar nuevas firmas o entregas. Se conservan los trabajos en curso.',
  AGENT_OFFLINE: 'El equipo dejó de informar su estado. Revisa el servicio y la conexión.',
  TOKEN_MISSING: 'Conecta el token al equipo firmante.',
  CERT_EXPIRING: 'El certificado vence dentro de 30 días. Programa su renovación.',
  CERT_EXPIRED: 'El certificado venció. Se requiere renovación.',
  CERT_REVOKED: 'El certificado fue rechazado por revocación. Detén su uso y contacta al proveedor.',
  DRIVER_ERROR: 'Revisa el controlador y la selección del certificado en el equipo firmante.',
  QUEUE_AGE: 'Hay firmas pendientes desde hace más de 15 minutos.',
  TSA_FAILURE: 'Falló repetidamente el fechado. Se conserva el perfil solicitado.',
  REVOCATION_FAILURE: 'No se pudo obtener evidencia de vigencia. Se conserva el perfil solicitado.',
  VALIDATION_FAILURE: 'Falló repetidamente la validación independiente. Revisa los documentos y el validador.',
  VALIDATION_REJECTED: 'Una firma no superó la validación independiente. Revisa el documento y el validador.',
  DELIVERY_LAG: 'Hay copias pendientes desde hace más de 15 minutos.',
  RECEIVER_DISK: 'Revisa el espacio y los permisos de la carpeta receptora.',
  DEVICE_FAILURE: 'El equipo informó un problema de procesamiento. Revisa su estado local.',
  SIGNING_FAILURE: 'Una firma requiere revisión del operador.',
  DELIVERY_FAILURE: 'Una entrega falló. Revisa el receptor antes de reintentar.',
  LEASE_EXPIRED: 'Una asignación venció. La recuperación automática conserva los resultados inciertos para revisión.',
  CLEANUP_PENDING: 'Hay transferencias temporales vencidas pendientes de limpieza.',
  MAINTENANCE_STALE: 'El mantenimiento no ha informado una ejecución correcta en los últimos 10 minutos.',
} as const
export type SigningAlert = { id: string; message: string; severity: 'warning' | 'critical';
  count: number; entityId?: string; diagnosticCode?: string }
export type DeliveryView = { id: string; deviceName: string; status: string; attemptCount: number;
  availableAt: string | null; deliveredAt: string | null; errorMessage: string | null; canRetry: boolean }
