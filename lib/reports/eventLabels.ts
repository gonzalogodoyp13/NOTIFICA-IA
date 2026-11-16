// Presentation labels only: stored audit event names remain unchanged.
const SUBJECTS: Record<string, [string, boolean?]> = {
  case: ['Rol'], roles: ['Rol'], role: ['Rol'],
  notification: ['Notificación', true], diligence: ['Diligencia', true],
  document: ['Documento'], stamp: ['Estampo'], receipt: ['Recibo'], note: ['Nota', true],
  Abogado: ['Abogado'], Banco: ['Banco'], Comuna: ['Comuna', true],
  DiligenciaTipo: ['Tipo de diligencia'], Estampo: ['Estampo'],
  EstampoCustom: ['Estampo personalizado'], Tribunal: ['Tribunal'],
  Materia: ['Materia', true], Procurador: ['Procurador'], tariff: ['Arancel'],
  OfficePdfConfig: ['Configuración de PDF', true], pdf: ['Configuración de PDF', true],
  signing: ['Firma', true], device: ['Dispositivo'],
  report: ['Reporte'], 'report.daily': ['Reporte diario'],
  'report.monthly': ['Reporte mensual'], 'report.custom': ['Reporte personalizado'],
  'report.custom_definition': ['Configuración de reporte personalizado', true],
  'report.job': ['Trabajo de reportes'],
}

const ACTIONS: Record<string, string> = {
  create: 'creado', created: 'creado', generate: 'creado', generated: 'creado',
  update: 'actualizado', updated: 'actualizado', delete: 'eliminado', deleted: 'eliminado',
  regenerated: 'regenerado', corrected: 'corregido', archived: 'archivado',
  reset: 'restablecido', toggled: 'con estado actualizado', status_changed: 'con estado actualizado',
  completed: 'completado', scheduled: 'programado', sent: 'enviado',
  downloaded: 'descargado', download: 'descargado', view: 'visualizado',
  access_denied: 'con acceso denegado', download_denied: 'con descarga denegada',
  download_failed: 'con error de descarga', generation_failed: 'con error de generación',
  requested: 'solicitado', assigned: 'asignado', validated: 'validado',
  validation_failed: 'con validación fallida', started: 'iniciado',
  failed: 'con error', retried: 'reintentado', cancelled: 'cancelado', canceled: 'cancelado',
  voided: 'anulado', annulled: 'anulado', queued: 'en cola', succeeded: 'completado',
  cancel_requested: 'con cancelación solicitada', enrolled: 'registrado', revoked: 'revocado',
}

const LABELS: Record<string, string> = {
  'auth.login': 'Inicio de sesión', 'auth.logout': 'Cierre de sesión',
  'search.roles': 'Búsqueda de roles', 'api.failure': 'Error de operación',
  'security.access_denied': 'Acceso denegado',
  'document.letterhead_generated': 'Membrete creado',
  'receipt.payment': 'Pago de recibos registrado', 'receipt.boleta': 'Boleta asociada',
  'receipt.undo': 'Operación de recibos deshecha', 'receipt.export': 'Recibos exportados',
  'receipt.send': 'Recibos enviados', 'receipt.resend': 'Recibos reenviados',
  'receipt.reply_sync': 'Respuestas de correos sincronizadas',
  'receipt.duplicate_override': 'Reenvío duplicado confirmado',
  'receipt.test_send': 'Correo de prueba enviado',
  'receipt.reply_classify': 'Respuesta de correo clasificada',
  'receipt.reply_associated': 'Respuesta asociada a un envío',
  'receipt.resolution': 'Resolución de envío actualizada',
  'receipt.health_check': 'Servicio de correo revisado',
  'audit.export': 'Auditoría exportada', 'audit.legacy_retired': 'Auditoría antigua depurada',
  'report.version.restored': 'Versión de reporte restaurada',
  'report.recipients.changed': 'Destinatarios de reportes actualizados',
  'report.schedule.changed': 'Programación de reportes actualizada',
  'report.schedule.run_now': 'Ejecución de reporte solicitada',
  'signing.remote_authorized': 'Firma remota autorizada',
  'signing.local_approved': 'Firma local aprobada',
  'signing.maintenance_completed': 'Mantenimiento de firmas completado',
  'signing.retry_scheduled': 'Reintento de firma programado',
  'signing.document_excluded': 'Documento excluido de la firma',
  'signing.completion_evaluated': 'Documentos revisados para firma',
  'signing.claimed': 'Firma asignada a un dispositivo',
  'signing.lease_renewed': 'Tiempo de firma renovado',
  'signing.lease_expired': 'Tiempo de firma agotado',
  'signing.released': 'Firma liberada',
  'signing.job_status_changed': 'Estado de firma actualizado',
  'device.enrollment_created': 'Registro de dispositivo solicitado',
  'device.enrollment_revoked': 'Registro de dispositivo cancelado',
  'device.health_changed': 'Estado de dispositivo actualizado',
  'device.delivery_started': 'Entrega de documento iniciada',
  'device.delivery_retried': 'Entrega de documento reintentada',
  'device.delivery_acknowledged': 'Entrega de documento confirmada',
  'device.delivery_failed': 'Error en la entrega de documento',
}

const ROUTE_SUBJECTS: Record<string, string> = {
  abogados: 'abogados', bancos: 'bancos', comunas: 'comunas', demandas: 'demandas',
  demanda: 'demandas', 'diligencia-tipos': 'tipos de diligencia', diligencias: 'diligencias',
  documentos: 'documentos', encargos: 'encargos', estampos: 'estampos',
  'estampos-custom': 'estampos personalizados', materias: 'materias', notas: 'notas',
  procuradores: 'procuradores', recibos: 'recibos', roles: 'roles', tribunal: 'tribunales',
  tribunals: 'tribunales', tribunales: 'tribunales', aranceles: 'aranceles',
  ajustes: 'ajustes', dashboard: 'panel de actividad', reports: 'reportes',
  signing: 'firmas', user: 'usuarios',
}

export function reportEventLabel(eventType: string): string {
  if (LABELS[eventType]) return LABELS[eventType]
  const name = eventType.replace(/^settings\./, '')
  const separator = name.lastIndexOf('.')
  const subject = SUBJECTS[name.slice(0, separator)]
  const action = ACTIONS[name.slice(separator + 1)]
  if (subject && action) {
    return `${subject[0]} ${subject[1] && !action.includes(' ') ? action.replace(/o$/, 'a') : action}`
  }
  // Older API audit entries use operation names such as put.abogados.id.
  const [method, resource] = eventType.split(/[. ]/)
  const operation = ({ get: 'Consulta', list: 'Consulta', post: 'Operación',
    put: 'Actualización', patch: 'Actualización', update: 'Actualización',
    create: 'Creación', delete: 'Eliminación' } as Record<string, string>)[method]
  if (operation && ROUTE_SUBJECTS[resource]) return `${operation} de ${ROUTE_SUBJECTS[resource]}`
  // Historical or newly added types must not expose internal event codes.
  return 'Actividad registrada'
}
