import 'server-only'

import { prismaNoMiddleware } from '@/lib/prismaNoMiddleware'
import { recordActivityEvent } from '@/lib/audit/activityEvent'

type OperationalEventType =
  | 'bulk_payment'
  | 'bulk_boleta'
  | 'bulk_undo'
  | 'receipt_export'
  | 'receipt_send'
  | 'receipt_reply_sync'
  | 'receipt_duplicate_override'
  | 'receipt_test_send'
  | 'receipt_resend'
  | 'receipt_reply_classify'
  | 'receipt_resolution'
  | 'receipt_health_check'

const EVENT_MAP: Record<OperationalEventType, { eventType: string; module: 'recibos' | 'emails' | 'payments'; description: string }> = {
  bulk_payment: { eventType: 'receipt.payment', module: 'payments', description: 'Pago masivo de recibos registrado.' },
  bulk_boleta: { eventType: 'receipt.boleta', module: 'payments', description: 'Boleta asociada a recibos.' },
  bulk_undo: { eventType: 'receipt.undo', module: 'payments', description: 'Operacion masiva de recibos deshecha.' },
  receipt_export: { eventType: 'receipt.export', module: 'recibos', description: 'Exportacion de recibos generada.' },
  receipt_send: { eventType: 'receipt.send', module: 'emails', description: 'Envio de recibos registrado.' },
  receipt_reply_sync: { eventType: 'receipt.reply_sync', module: 'emails', description: 'Sincronizacion de respuestas de recibos registrada.' },
  receipt_duplicate_override: { eventType: 'receipt.duplicate_override', module: 'emails', description: 'Reenvio duplicado de recibos confirmado.' },
  receipt_test_send: { eventType: 'receipt.test_send', module: 'emails', description: 'Envio de prueba de recibos registrado.' },
  receipt_resend: { eventType: 'receipt.resend', module: 'emails', description: 'Reenvio de recibos registrado.' },
  receipt_reply_classify: { eventType: 'receipt.reply_classify', module: 'emails', description: 'Respuesta de recibos clasificada.' },
  receipt_resolution: { eventType: 'receipt.resolution', module: 'emails', description: 'Resolucion de envio de recibos actualizada.' },
  receipt_health_check: { eventType: 'receipt.health_check', module: 'emails', description: 'Revision de proveedor de correo realizada.' },
}

export async function recordOperationalActivity(params: {
  userId: string
  officeId: number
  eventType: OperationalEventType
  rolId?: string
  reciboIds?: string[]
  count: number
  numeroBoleta?: string
  fechaPago?: string
  details?: Record<string, unknown>
}) {
  const mapped = EVENT_MAP[params.eventType]
  await recordActivityEvent({
    userId: params.userId,
    officeId: params.officeId,
    eventType: mapped.eventType,
    module: mapped.module,
    result: params.details?.status === 'failed' ? 'failure' : 'success',
    recordType: 'recibo',
    rolId: params.rolId,
    description: mapped.description,
    metadata: {
      count: params.count,
      receiptIds: params.reciboIds?.slice(0, 100),
      numeroBoleta: params.numeroBoleta,
      fechaPago: params.fechaPago,
      ...params.details,
    },
  })

  try {
    await prismaNoMiddleware.auditLog.create({
      data: {
        userId: params.userId,
        officeId: params.officeId,
        tabla: 'OperationalActivity',
        accion: params.eventType,
        diff: {
          rolId: params.rolId,
          reciboIds: params.reciboIds?.slice(0, 100),
          count: params.count,
          numeroBoleta: params.numeroBoleta,
          fechaPago: params.fechaPago,
          ...params.details,
        },
      },
    })
  } catch (error) {
    console.error('[operational activity] Could not record event:', error)
  }
}
